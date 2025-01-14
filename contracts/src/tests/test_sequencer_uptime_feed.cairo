use starknet::ContractAddress;
use starknet::EthAddress;
use starknet::contract_address_const;
use starknet::class_hash::class_hash_const;
use starknet::class_hash::Felt252TryIntoClassHash;
use starknet::syscalls::deploy_syscall;
use starknet::testing::set_caller_address;
use starknet::testing::set_contract_address;

use array::ArrayTrait;
use traits::Into;
use traits::TryInto;
use option::OptionTrait;
use core::result::ResultTrait;

use chainlink::emergency::sequencer_uptime_feed::SequencerUptimeFeed;
use chainlink::ocr2::aggregator_proxy::AggregatorProxy;
use chainlink::ocr2::aggregator_proxy::AggregatorProxy::AggregatorProxyImpl;
use chainlink::tests::test_ownable::should_implement_ownable;
use chainlink::tests::test_access_controller::should_implement_access_control;

use chainlink::emergency::sequencer_uptime_feed::{
    ISequencerUptimeFeed, ISequencerUptimeFeedDispatcher, ISequencerUptimeFeedDispatcherTrait
};

fn PROXY() -> AggregatorProxy::ContractState {
    AggregatorProxy::contract_state_for_testing()
}

fn STATE() -> SequencerUptimeFeed::ContractState {
    SequencerUptimeFeed::contract_state_for_testing()
}

fn setup() -> (ContractAddress, ContractAddress, ISequencerUptimeFeedDispatcher) {
    let account: ContractAddress = contract_address_const::<777>();
    set_caller_address(account);

    // Deploy seqeuencer uptime feed
    let calldata = array![0, // initial status
     account.into() // owner
    ];
    let (sequencerFeedAddr, _) = deploy_syscall(
        SequencerUptimeFeed::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false
    )
        .unwrap();
    let sequencerUptimeFeed = ISequencerUptimeFeedDispatcher {
        contract_address: sequencerFeedAddr
    };

    (account, sequencerFeedAddr, sequencerUptimeFeed)
}

#[test]
#[available_gas(2000000)]
fn test_ownable() {
    let (account, sequencerFeedAddr, _) = setup();
    should_implement_ownable(sequencerFeedAddr, account);
}

#[test]
#[available_gas(3000000)]
fn test_access_control() {
    let (account, sequencerFeedAddr, _) = setup();
    should_implement_access_control(sequencerFeedAddr, account);
}

#[test]
#[available_gas(2000000)]
#[should_panic()]
fn test_set_l1_sender_not_owner() {
    let (_, _, sequencerUptimeFeed) = setup();
    sequencerUptimeFeed.set_l1_sender(EthAddress { address: 789 });
}

#[test]
#[available_gas(2000000)]
fn test_set_l1_sender() {
    let (owner, _, sequencerUptimeFeed) = setup();
    set_contract_address(owner);
    sequencerUptimeFeed.set_l1_sender(EthAddress { address: 789 });
    assert(sequencerUptimeFeed.l1_sender().address == 789, 'l1_sender should be set to 789');
}

#[test]
#[available_gas(2000000)]
#[should_panic(expected: ('user does not have read access',))]
fn test_latest_round_data_no_access() {
    let (owner, sequencerFeedAddr, _) = setup();
    let mut proxy = PROXY();
    AggregatorProxy::constructor(ref proxy, owner, sequencerFeedAddr);
    AggregatorProxyImpl::latest_round_data(@proxy);
}

#[test]
#[available_gas(2000000)]
#[should_panic(expected: ('user does not have read access',))]
fn test_aggregator_proxy_response() {
    let (owner, sequencerFeedAddr, _) = setup();
    let mut proxy = PROXY();
    AggregatorProxy::constructor(ref proxy, owner, sequencerFeedAddr);

    // latest round data
    let latest_round_data = AggregatorProxyImpl::latest_round_data(@proxy);
    assert(latest_round_data.answer == 0, 'latest_round_data should be 0');

    // description
    let description = AggregatorProxyImpl::description(@proxy);
    assert(description == 'L2 Sequencer Uptime Status Feed', 'description does not match');

    // decimals
    let decimals = AggregatorProxyImpl::decimals(@proxy);
    assert(decimals == 0, 'decimals should be 0');
}
