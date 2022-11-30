import { useWeb3Context } from "@/contexts/Web3ContextProvider";
import { TransactionResponse } from "@ethersproject/abstract-provider";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import React, { useCallback, useMemo, useState } from "react";
import ReactGA from "react-ga";
import { Redirect, RouteComponentProps } from "react-router";
import {
  CurrencyAmount,
  Fraction,
  JSBI,
  Percent,
  Token,
  TokenAmount,
  WETH,
} from "uniswap-v2-sdk-scroll";
import { ButtonConfirmed } from "../../components/Button";
import { LightCard } from "../../components/Card";
import { AutoColumn } from "../../components/Column";
import QuestionHelper from "../../components/QuestionHelper";
import { AutoRow } from "../../components/Row";
import { Dots } from "../../components/swap/styleds";
import { DEFAULT_DEADLINE_FROM_NOW } from "../../constants";
import { useTotalSupply } from "../../data/TotalSupply";
import { useToken } from "../../hooks/Tokens";
import { useV1ExchangeContract } from "../../hooks/useContract";
import { NEVER_RELOAD, useSingleCallResult } from "../../state/multicall/hooks";
import {
  useIsTransactionPending,
  useTransactionAdder,
} from "../../state/transactions/hooks";
import { useETHBalances, useTokenBalance } from "../../state/wallet/hooks";
import { BackArrow, TYPE } from "../../theme";
import { isAddress } from "../../utils";
import { BodyWrapper } from "../AppBody";
import { EmptyState } from "./EmptyState";
import { V1LiquidityInfo } from "./MigrateV1Exchange";

const WEI_DENOM = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18));
const ZERO = JSBI.BigInt(0);
const ONE = JSBI.BigInt(1);
const ZERO_FRACTION = new Fraction(ZERO, ONE);

function V1PairRemoval({
  exchangeContract,
  liquidityTokenAmount,
  token,
}: {
  exchangeContract: Contract;
  liquidityTokenAmount: TokenAmount;
  token: Token;
}) {
  const { chainId } = useWeb3Context();
  const totalSupply = useTotalSupply(liquidityTokenAmount.token);
  const exchangeETHBalance = useETHBalances([
    liquidityTokenAmount.token.address,
  ])?.[liquidityTokenAmount.token.address];
  const exchangeTokenBalance = useTokenBalance(
    liquidityTokenAmount.token.address,
    token
  );

  const [confirmingRemoval, setConfirmingRemoval] = useState<boolean>(false);
  const [pendingRemovalHash, setPendingRemovalHash] = useState<string | null>(
    null
  );

  const shareFraction: Fraction = totalSupply
    ? new Percent(liquidityTokenAmount.raw, totalSupply.raw)
    : ZERO_FRACTION;

  const ethWorth: CurrencyAmount = exchangeETHBalance
    ? CurrencyAmount.ether(
        exchangeETHBalance.multiply(shareFraction).multiply(WEI_DENOM).quotient
      )
    : CurrencyAmount.ether(ZERO);

  const tokenWorth: TokenAmount = exchangeTokenBalance
    ? new TokenAmount(
        token,
        shareFraction.multiply(exchangeTokenBalance.raw).quotient
      )
    : new TokenAmount(token, ZERO);

  const addTransaction = useTransactionAdder();
  const isRemovalPending = useIsTransactionPending(
    pendingRemovalHash ?? undefined
  );

  const remove = useCallback(() => {
    if (!liquidityTokenAmount) return;

    setConfirmingRemoval(true);
    exchangeContract
      .removeLiquidity(
        liquidityTokenAmount.raw.toString(),
        1, // min_eth, this is safe because we're removing liquidity
        1, // min_tokens, this is safe because we're removing liquidity
        Math.floor(new Date().getTime() / 1000) + DEFAULT_DEADLINE_FROM_NOW
      )
      .then((response: TransactionResponse) => {
        ReactGA.event({
          category: "Remove",
          action: "V1",
          label: token?.symbol,
        });

        addTransaction(response, {
          summary: `Remove ${
            chainId && token.equals(WETH[chainId]) ? "WETH" : token.symbol
          }/ETH V1 liquidity`,
        });
        setPendingRemovalHash(response.hash);
      })
      .catch((error: Error) => {
        console.error(error);
        setConfirmingRemoval(false);
      });
  }, [exchangeContract, liquidityTokenAmount, token, chainId, addTransaction]);

  const noLiquidityTokens =
    !!liquidityTokenAmount && liquidityTokenAmount.equalTo(ZERO);

  const isSuccessfullyRemoved = !!pendingRemovalHash && noLiquidityTokens;

  return (
    <AutoColumn gap="20px">
      <TYPE.body my={9} style={{ fontWeight: 400 }}>
        This tool will remove your V1 liquidity and send the underlying assets
        to your wallet.
      </TYPE.body>

      <LightCard>
        <V1LiquidityInfo
          token={token}
          liquidityTokenAmount={liquidityTokenAmount}
          tokenWorth={tokenWorth}
          ethWorth={ethWorth}
        />

        <div style={{ display: "flex", marginTop: "1rem" }}>
          <ButtonConfirmed
            confirmed={isSuccessfullyRemoved}
            disabled={
              isSuccessfullyRemoved ||
              noLiquidityTokens ||
              isRemovalPending ||
              confirmingRemoval
            }
            onClick={remove}
          >
            {isSuccessfullyRemoved ? (
              "Success"
            ) : isRemovalPending ? (
              <Dots>Removing</Dots>
            ) : (
              "Remove"
            )}
          </ButtonConfirmed>
        </div>
      </LightCard>
      <TYPE.darkGray style={{ textAlign: "center" }}>
        {`Your Uniswap V1 ${
          chainId && token.equals(WETH[chainId]) ? "WETH" : token.symbol
        }/ETH liquidity will be redeemed for underlying assets.`}
      </TYPE.darkGray>
    </AutoColumn>
  );
}

export default function RemoveV1Exchange({
  match: {
    params: { address },
  },
}: RouteComponentProps<{ address: string }>) {
  const validatedAddress = isAddress(address);
  const { chainId, walletCurrentAddress } = useWeb3Context();

  const exchangeContract = useV1ExchangeContract(
    validatedAddress ? validatedAddress : undefined,
    true
  );
  const tokenAddress = useSingleCallResult(
    exchangeContract,
    "tokenAddress",
    undefined,
    NEVER_RELOAD
  )?.result?.[0];
  const token = useToken(tokenAddress);

  const liquidityToken: Token | undefined = useMemo(
    () =>
      validatedAddress && chainId && token
        ? new Token(
            chainId,
            validatedAddress,
            18,
            `UNI-V1-${token.symbol}`,
            "Uniswap V1"
          )
        : undefined,
    [chainId, validatedAddress, token]
  );
  const userLiquidityBalance = useTokenBalance(
    walletCurrentAddress ?? undefined,
    liquidityToken
  );

  // redirect for invalid url params
  if (!validatedAddress || tokenAddress === AddressZero) {
    console.error("Invalid address in path", address);
    return <Redirect to="/migrate/v1" />;
  }

  return (
    <BodyWrapper style={{ padding: 24 }} id="remove-v1-exchange">
      <AutoColumn gap="16px">
        <AutoRow
          style={{ alignItems: "center", justifyContent: "space-between" }}
          gap="8px"
        >
          <BackArrow to="/migrate/v1" />
          <TYPE.mediumHeader>Remove V1 Liquidity</TYPE.mediumHeader>
          <div>
            <QuestionHelper text="Remove your Uniswap V1 liquidity tokens." />
          </div>
        </AutoRow>

        {!walletCurrentAddress ? (
          <TYPE.largeHeader>You must connect an account.</TYPE.largeHeader>
        ) : userLiquidityBalance && token && exchangeContract ? (
          <V1PairRemoval
            exchangeContract={exchangeContract}
            liquidityTokenAmount={userLiquidityBalance}
            token={token}
          />
        ) : (
          <EmptyState message="Loading..." />
        )}
      </AutoColumn>
    </BodyWrapper>
  );
}