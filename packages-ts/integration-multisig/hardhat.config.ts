import { HardhatUserConfig } from 'hardhat/types'
import '@shardlabs/starknet-hardhat-plugin'

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  starknet: {
    venv: 'active',
    network: 'devnet',
    wallets: {
      OpenZeppelin: {
        accountName: 'OpenZeppelin',
        modulePath: 'starkware.starknet.wallets.open_zeppelin.OpenZeppelinAccount',
        accountPath: '~/.starknet_accounts',
      },
    },
  },
  networks: {
    devnet: {
      url: 'http://127.0.0.1:5050/',
      args: ['--cairo-compiler-manifest', '../../vendor/cairo/Cargo.toml'],
    },
  },
  paths: {
    sources: './solidity',
    starknetSources: '../../contracts/src',
    starknetArtifacts: '../../contracts/target/release',
    cairoPaths: [],
  },
}

export default config
