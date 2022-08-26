import { expect } from 'chai'
import { starknet } from 'hardhat'
import { StarknetContract, Account } from 'hardhat/types/runtime'
import { number } from 'starknet'
import { assertErrorMsg } from '../utils'

describe('SequencerUptimeFeed', function () {
  this.timeout(300_000)

  let owner: Account
  let nonOwner: Account

  // should be beforeeach, but that'd be horribly slow. Just remember that the tests are not idempotent
  before(async function () {
    owner = await starknet.deployAccount('OpenZeppelin')
    nonOwner = await starknet.deployAccount('OpenZeppelin')
  })

  describe('Test access control via inherited `simple_read_access_controller`', function () {
    const user = 101
    let uptimeFeedContract: StarknetContract

    before(async function () {
      const uptimeFeedFactory = await starknet.getContractFactory('sequencer_uptime_feed')
      uptimeFeedContract = await uptimeFeedFactory.deploy({
        initial_status: 0,
        owner_address: number.toBN(owner.starknetContract.address),
      })
    })

    it('should block non-owners from making admin changes', async function () {
      await owner.invoke(uptimeFeedContract, 'add_access', { user })

      try {
        await nonOwner.invoke(uptimeFeedContract, 'add_access', { user })
        expect.fail()
      } catch (err: any) {
        assertErrorMsg(err?.message, 'Ownable: caller is not the owner')
      }
    })

    it('should report access information correctly', async function () {
      {
        const res = await uptimeFeedContract.call('has_access', { user: user, data: [] })
        expect(res.bool).to.equal(1n)
      }

      {
        const res = await uptimeFeedContract.call('has_access', { user: user + 1, data: [] })
        expect(res.bool).to.equal(0n)
      }
    })

    it('should error on `check_access` without access', async function () {
      await uptimeFeedContract.call('check_access', { user: user })

      try {
        await owner.invoke(uptimeFeedContract, 'check_access', { user: user + 1 })
        expect.fail()
      } catch (err: any) {
        assertErrorMsg(err?.message, 'AccessController: address does not have access')
      }
    })
  })

  describe('Test IAggregator interface using a Proxy', function () {
    let uptimeFeedContract: StarknetContract
    let proxyContract: StarknetContract

    before(async function () {
      const uptimeFeedFactory = await starknet.getContractFactory('sequencer_uptime_feed')
      uptimeFeedContract = await uptimeFeedFactory.deploy({
        initial_status: 0,
        owner_address: number.toBN(owner.starknetContract.address),
      })

      const proxyFactory = await starknet.getContractFactory('proxy')
      proxyContract = await proxyFactory.deploy({
        owner: number.toBN(owner.starknetContract.address),
        address: number.toBN(uptimeFeedContract.address),
      })
    })

    it('should allow access without specifying account (toolchain quirk)', async function () {
      // NOTICE: This test should fail on AC check, but it passes!?
      // The StarkNet Devnet simulator sets the contract as the caller account, when no explicit account is used - this makes the AC check pass.
      {
        const res = await proxyContract.call('latest_round_data')
        expect(res.round.answer).to.equal(0n)
      }
    })

    it('should block access when using an account without access', async function () {
      const accWithoutAccess = await starknet.deployAccount('OpenZeppelin')

      try {
        await accWithoutAccess.call(proxyContract, 'latest_round_data')
        expect.fail()
      } catch (err: any) {
        assertErrorMsg(err?.message, 'AccessController: address does not have access')
      }
    })

    it('should respond via a Proxy', async function () {
      {
        const res = await proxyContract.call('latest_round_data')
        expect(res.round.answer).to.equal(0n)
      }

      {
        const res = await proxyContract.call('description')
        expect(res.description).to.equal(
          134626335741441605527772921271890603575702899782138692259993464692975953252n,
        )
      }

      {
        const res = await proxyContract.call('decimals')
        expect(res.decimals).to.equal(0n)
      }

      // TODO: enable access check and assert correct behaviour
    })
  })
})
