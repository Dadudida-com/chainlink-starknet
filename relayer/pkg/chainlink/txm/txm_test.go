//go:build integration

package txm

import (
	"context"
	"testing"
	"time"

	"github.com/pkg/errors"
	caigogw "github.com/smartcontractkit/caigo/gateway"
	"github.com/smartcontractkit/caigo/test"
	caigotypes "github.com/smartcontractkit/caigo/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/smartcontractkit/chainlink-relay/pkg/logger"

	"github.com/smartcontractkit/chainlink-starknet/relayer/pkg/chainlink/keys"
	"github.com/smartcontractkit/chainlink-starknet/relayer/pkg/chainlink/keys/mocks"
	txmmock "github.com/smartcontractkit/chainlink-starknet/relayer/pkg/chainlink/txm/mocks"
	"github.com/smartcontractkit/chainlink-starknet/relayer/pkg/starknet"
)

func TestIntegration_Txm(t *testing.T) {
	url := SetupLocalStarknetNode(t)
	devnet := test.NewDevNet(url)
	accounts, err := devnet.Accounts()
	require.NoError(t, err)

	// parse keys into expected format
	localKeys := map[string]keys.Key{}
	for i := range accounts {
		privKey, err := caigotypes.HexToBytes(accounts[i].PrivateKey)
		require.NoError(t, err)

		key := keys.Raw(privKey).Key()
		assert.Equal(t, caigotypes.HexToHash(accounts[i].PublicKey), caigotypes.HexToHash(key.ID()))
		assert.Equal(t, caigotypes.HexToHash(accounts[i].Address), caigotypes.HexToHash(key.DevnetAccountAddrStr()))
		localKeys[key.ID()] = key
	}

	// mock keystore
	ks := new(mocks.Keystore)
	ks.On("Get", mock.AnythingOfType("string")).Return(
		func(id string) keys.Key {
			return localKeys[id]
		},
		func(id string) error {

			_, ok := localKeys[id]
			if !ok {
				return errors.New("key does not exist")
			}
			return nil
		},
	)

	lcfg := logger.Config{Level: -1} // debug level
	lggr, err := lcfg.New()
	require.NoError(t, err)
	timeout := 10 * time.Second
	client, err := starknet.NewClient(caigogw.GOERLI_ID, url, lggr, &timeout)
	require.NoError(t, err)

	getClient := func() (*starknet.Client, error) {
		return client, err
	}

	// mock config to prevent import cycle
	cfg := txmmock.NewConfig(t)
	cfg.On("TxTimeout").Return(10 * time.Second) // I'm guessing this should actually just be 10?
	cfg.On("ConfirmationPoll").Return(1 * time.Second)

	txm, err := New(lggr, ks, cfg, getClient)
	require.NoError(t, err)

	// ready fail if start not called
	require.Error(t, txm.Ready())

	// start txm + checks
	require.NoError(t, txm.Start(context.Background()))
	require.NoError(t, txm.Ready())

	for k := range localKeys {
		key := caigotypes.HexToHash(k)
		for i := 0; i < 2; i++ {
			require.NoError(t, txm.Enqueue(key, caigotypes.HexToHash(localKeys[k].DevnetAccountAddrStr()), caigotypes.FunctionCall{
				ContractAddress:    caigotypes.HexToHash("0x49D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7"), // send to ETH token contract
				EntryPointSelector: "totalSupply",
			}))
		}
	}
	var empty bool
	for i := 0; i < 60; i++ {
		queued, unconfirmed := txm.InflightCount()
		t.Logf("inflight count: queued (%d), unconfirmed (%d)", queued, unconfirmed)

		if queued == 0 && unconfirmed == 0 {
			empty = true
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	// stop txm
	assert.True(t, empty, "txm timed out while trying to confirm transactions")
	require.NoError(t, txm.Close())
	require.Error(t, txm.Ready())
}
