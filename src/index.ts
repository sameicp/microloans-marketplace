import { Canister, StableBTreeMap, query, text, update, Opt, Principal, nat, int, ic, Some, None, Void, bool } from 'azle';
import {managementCanister, HttpResponse, HttpTransformArgs} from 'azle/canisters/management';

// This is a global variable that is stored on the heap
const LIQUIDATION_THRESHOLD = 50n; // 200% overcollateralized
const LIQUIDATION_PRECISION = 100n;
const LIQUIDATION_BONUS = 10; // this mean 10% bonus
const MIN_HEALTH_FACTOR = 1;

let interest_rate = 2n;
let totalckEth: nat = 0n;
let ethereumToUsd = 2_000n;
let icpToUsd = 6n;
let btcToUsd = 45_000n;

let ckEthPool = 0n;


////////////////////////
// StableBTreeMpas   ///
////////////////////////

let s_collateralDeposited = StableBTreeMap<Principal, nat>(Principal, nat, 0);
let s_EthBorrowed = StableBTreeMap<Principal, nat>(Principal, nat, 2);
let s_lender = StableBTreeMap<Principal, nat>(Principal, nat, 3);
let s_debt = StableBTreeMap<Principal, nat>(Principal, nat, 4);

export default Canister({
    // depositCollateralAndBorrowTokens
    
    // depositCollateral
    depositCollateral: update([text, nat], nat, (userId, deposit)=>{
        // check if collateral is more than zero
        if( deposit <= 0n){
            throw new Error('can not deposit 0 ICP as collateral')
        }
        if( userId === ''){
            throw new Error('no user identity')
        }
        const userPrincipal: Principal = Principal.fromText(userId);
        s_collateralDeposited.insert(userPrincipal, deposit);
        return deposit;
    }),

    // borrowTokens
    borrowTokens: update([text, nat], Void, async (userId, amountToBorrow)=>{
        if( userId === ''){
            throw new Error('no user id');
        }
        if(amountToBorrow <= 0n){
            throw new Error('can not borrow zero amount')
        }
        if(amountToBorrow > ckEthPool){
            throw new Error('user can not borrow because of lack of the token');
        }
        const userPrincipal: Principal = Principal.fromText(userId);
        revertIfHealthFactorIsBroken(userPrincipal, amountToBorrow);
        s_debt.insert(userPrincipal, amountToBorrow);
        ckEthPool -= amountToBorrow;

    }),

    // lendTokens

    // escrow service (how)

    // liquidation (borrower);

    // getAccountCollateralValue

    // getUsdValueForTokens

    // getCollateralDeposited

    // getHealthFactor

    // getAccountInformation

    // getLiquidationBonus

    // getCollateralTokens)

    getPrice: update([text], HttpResponse, async(coin)=>{
        return await ic.call(managementCanister.http_request, {
          args: [
            {
              url: `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`,
              max_response_bytes: Some(2_000n),
              method: {
                get: null
              },
              headers: [],
              body: None,
              transform: Some({
                function: [ic.id(), 'priceTransform'] as [
                  Principal,
                  string
                ],
                context: Uint8Array.from([])
              })
            }
          ],
          cycles: 50_000_000n
        })
      }),
    
      priceTransform: query([HttpTransformArgs], HttpResponse, (args)=>{
        return{
          ...args.response,
          headers: []
        };
      })
});

const revertIfHealthFactorIsBroken = (userId: Principal, amt: nat)=>{
    const depositOpt = s_collateralDeposited.get(userId);
    if( 'None' in depositOpt){
        throw new Error('Can not find the deposits with the id');
    }
    const deposit: nat = depositOpt.Some;
    const healthFactor: nat = calculateHealthFactor(deposit, amt);

    if( healthFactor < 1){
        throw new Error('Can not borrow because you have low collateral')
    }
}

const convertTokensToUsd = (token: nat, usdPrice: nat)=>{
    return token * usdPrice;
}

const calculateHealthFactor = (deposit: nat, borrow: nat): nat=>{
    const depositInUsd: nat = convertTokensToUsd(deposit, icpToUsd);
    const fundsToBorrowInUsd: nat = convertTokensToUsd(borrow, ethereumToUsd);
    const depositAdjuctedForThreshold: nat = (depositInUsd * LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
    const healthFactor: nat = depositAdjuctedForThreshold / fundsToBorrowInUsd;
    return healthFactor;
}
// BTC - https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
// ETH - https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd
// ICP - https://api.coingecko.com/api/v3/simple/price?ids=internet-computer&vs_currencies=usd

// function the get the prices of the tokens
// Lenders can earn interest thanks to the lending protocol
// DeFi lending solutions frequently give long-term lenders the chance to earn substantially through lending rates
// 