// Inclusion check against Binance's proof-of-solvency account tree, using Binance's OWN open-source code
// (github.com/binance/zkmerkle-proof-of-solvency, pinned in go.mod): the same leaf hash (Poseidon over BN254) and the
// same fixed-depth Merkle proof check as Binance's `verifier -user`.
//
//	inclusion verify <user_record.json>   -> prints {"included": true|false, "leaf": "...", "root": "..."}
//	inclusion testvectors <out_dir>       -> builds a small tree with Binance's tree code and writes test records
package main

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"

	"github.com/binance/zkmerkle-proof-of-solvency/src/utils"
	"github.com/binance/zkmerkle-proof-of-solvency/src/verifier/config"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/poseidon"
)

type result struct {
	Included bool   `json:"included"`
	Leaf     string `json:"leaf,omitempty"`
	Root     string `json:"root,omitempty"`
	Error    string `json:"error,omitempty"`
}

// verify mirrors src/verifier/main.go (-user) without its panics.
func verify(rec *config.UserConfig) result {
	root, err := hex.DecodeString(rec.Root)
	if err != nil || len(root) != 32 {
		return result{Error: "invalid account tree root"}
	}
	proof := make([][]byte, 0, len(rec.Proof))
	for _, p := range rec.Proof {
		b, err := base64.StdEncoding.DecodeString(p)
		if err != nil || len(b) != 32 {
			return result{Error: "invalid proof element"}
		}
		proof = append(proof, b)
	}
	idHash, err := hex.DecodeString(rec.AccountIdHash)
	if err != nil || len(idHash) != 32 {
		return result{Error: "invalid AccountIdHash"}
	}
	hasher := poseidon.NewPoseidon()
	assets := utils.ComputeUserAssetsCommitment(&hasher, rec.Assets)
	leaf := poseidon.PoseidonBytes(idHash, rec.TotalEquity.Bytes(), rec.TotalDebt.Bytes(), rec.TotalCollateral.Bytes(), assets)
	ok := utils.VerifyMerkleProof(root, rec.AccountIndex, proof, leaf)
	return result{Included: ok, Leaf: hex.EncodeToString(leaf), Root: rec.Root}
}

func writeJSON(path string, v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	if err := os.WriteFile(path, append(b, '\n'), 0o644); err != nil {
		panic(err)
	}
}

// testvectors builds a 6-account tree with utils.NewAccountTree / AccountInfoToHash (Binance's code) and writes one
// valid record plus edited ones that must fail.
func testvectors(dir string) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		panic(err)
	}
	tree, err := utils.NewAccountTree(16)
	if err != nil {
		panic(err)
	}
	accounts := make([]utils.AccountInfo, 6)
	for i := range accounts {
		id := make([]byte, 32)
		id[31] = byte(0x40 + i)
		assets := []utils.AccountAsset{
			{Index: 0, Equity: uint64(1_000_000 * (i + 1)), Debt: uint64(1000 * i), Loan: 0, Margin: 0, PortfolioMargin: 0},
			{Index: 3, Equity: uint64(25_000 + i), Debt: 0, Loan: uint64(10 * i), Margin: 0, PortfolioMargin: 0},
		}
		accounts[i] = utils.AccountInfo{
			AccountIndex:    uint32(i),
			AccountId:       id,
			TotalEquity:     new(big.Int).SetUint64(uint64(5_000_000 * (i + 1))),
			TotalDebt:       new(big.Int).SetUint64(uint64(4_000 * i)),
			TotalCollateral: new(big.Int).SetUint64(uint64(2_000 * i)),
			Assets:          assets,
		}
		h := poseidon.NewPoseidon()
		if err := tree.Set(uint32(i), utils.AccountInfoToHash(&accounts[i], &h)); err != nil {
			panic(err)
		}
	}
	tree.Build()
	root := hex.EncodeToString(tree.Root())

	record := func(a utils.AccountInfo) config.UserConfig {
		proof, err := tree.GetProof(a.AccountIndex)
		if err != nil {
			panic(err)
		}
		enc := make([]string, len(proof))
		for i, p := range proof {
			enc[i] = base64.StdEncoding.EncodeToString(p)
		}
		return config.UserConfig{
			AccountIndex:    a.AccountIndex,
			AccountIdHash:   hex.EncodeToString(a.AccountId),
			TotalEquity:     *a.TotalEquity,
			TotalDebt:       *a.TotalDebt,
			TotalCollateral: *a.TotalCollateral,
			Root:            root,
			Assets:          a.Assets,
			Proof:           enc,
		}
	}
	valid := record(accounts[2])
	writeJSON(filepath.Join(dir, "valid.json"), &valid)

	edited := record(accounts[2])
	edited.Assets = append([]utils.AccountAsset{}, edited.Assets...)
	edited.Assets[0].Equity++ // one unit more than the exchange recorded
	writeJSON(filepath.Join(dir, "edited_balance.json"), &edited)

	otherSlot := record(accounts[2])
	otherSlot.AccountIndex = 3 // right leaf, wrong position
	writeJSON(filepath.Join(dir, "wrong_index.json"), &otherSlot)

	otherRoot := record(accounts[2])
	otherRoot.Root = "1a4940fecdbf2f7d8fe9c4f16083ceb587f69f0b9af0d02d528235757536668f"
	writeJSON(filepath.Join(dir, "wrong_root.json"), &otherRoot)
	fmt.Println("root", root)
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: inclusion verify <record.json> | inclusion testvectors <dir>")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "verify":
		b, err := os.ReadFile(os.Args[2])
		if err != nil {
			panic(err)
		}
		rec := &config.UserConfig{}
		if err := json.Unmarshal(b, rec); err != nil {
			out, _ := json.Marshal(result{Error: "bad record JSON: " + err.Error()})
			fmt.Println(string(out))
			os.Exit(1)
		}
		out, _ := json.Marshal(verify(rec))
		fmt.Println(string(out))
	case "testvectors":
		testvectors(os.Args[2])
	default:
		os.Exit(2)
	}
}
