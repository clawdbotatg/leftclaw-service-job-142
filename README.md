# Creature Feature 🐾

**Live URL:** https://bafybeifgbirlzntibpo633boooan3lk54i3tlyisdp5mlk5za2xz4arut4.ipfs.community.bgipfs.com/

An onchain wildlife crown game built on Base. Wildlife observers, pet lovers, and artists compete for "Crowns" in king-of-the-hill contests. Every interaction automatically burns CLAWD, funds the CLAWD builders fund, and donates to WWF via Endaoment.

## Live App

Deployed to IPFS via BGIPFS — see `DEPLOYMENT.md` for the live URL after deployment.

## Smart Contract

**CreatureFeature.sol** — deployed on Base

| Contract | Address | Basescan |
|---|---|---|
| CreatureFeature | `0xa16e4054fb237cedc979b24aacdbbf6548f4617a` | [View](https://basescan.org/address/0xa16e4054fb237cedc979b24aacdbbf6548f4617a) |

Owner: `0xc99f74bc7c065d8c51bd724da898d44f775a8a19`

## How It Works

1. **Share** — Post a Wild (iNaturalist), Pet, or Art creation ($0.075 in ETH/USDC/CLAWD)
2. **Compete** — Challenge any Crown in any category ($0.50), vote on challenges ($0.10)
3. **Fund Wildlife** — 30% of every payment routes to WWF via Endaoment, 40% burns CLAWD, 30% goes to the CLAWD builders fund

CLAWD payments get a 15% discount.

## Payment Split (default)
- 40% burned as CLAWD
- 30% to CLAWD builders treasury
- 30% to WWF via Endaoment on Base

## Running Locally

```bash
yarn install
yarn fork --network base
yarn deploy
yarn start
```

## Architecture

- Frontend: Next.js static export, SE2 v2, wagmi/viem, RainbowKit
- Contract: Single Solidity contract on Base, Ownable2Step + ReentrancyGuard + SafeERC20
- IPFS hosting: bgipfs.com
- Charity: Endaoment on Base → WWF EIN 52-1693387

## Next Steps

See NEXT_STEPS.md for planned additions.
