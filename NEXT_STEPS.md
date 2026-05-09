# Creature Feature — Next Steps (v2)

## What Was Delivered (v1 Prototype)

- Full CreatureFeature.sol smart contract on Base
  - Posts, categories (10 pre-seeded), crown system, spotlight auctions
  - Multi-token payments (ETH/USDC/CLAWD with 15% CLAWD discount)
  - 40/30/30 split: burn/treasury/WWF charity via Endaoment
  - Ownable2Step, ReentrancyGuard, SafeERC20 throughout
  - Verified on Basescan
- Frontend: Homepage (spotlight, three crowns, create post), Categories, Crown/Category page, Spotlight page
- Deployed to IPFS

## Out of Scope (v2 Feature Requests)

### Frontend Pages Not Yet Built
- **Profile page** (`/u/[address]`) — user posts grid, stats (crowns held, lifetime wins, reign times, spotlights)
- **Post detail page** (`/p/[id]`) — full image, metadata, crown history, flag button with cost display
- **How It Works** (`/how`) — plain-language explainer with screenshots
- **Why I Built This** (`/why`) — personal note from creator (needs copy from client)
- **About CLAWD** (`/clawd`) — CLAWD ecosystem, burn counter specific to Creature Feature

### Frontend Features Not Yet Implemented
- **iNaturalist observation browser** — scrollable grid of recent observations, species search, photo filter to open-data only, 5-10min browser cache
- **Pinata browser SDK integration** — drag-drop/camera upload for Pet/Art posts, JWT domain-restricted key, loading state during pin, IPFS CID passed to createPost
- **Wild image snapshot pinning** — when Crown or Spotlight resolves with a Wild post, frontend re-pins the iNat image to IPFS and calls setCrownImageSnapshot/setSpotlightImageSnapshot
- **Inline first-time tooltips** — one-time modal on first Challenge/Vote/Bid explaining the mechanic (localStorage flag)
- **Mobile camera roll integration** — `<input type="file" accept="image/*">` for Pet/Art
- **Graceful 404 for deleted iNat observations** — "This creature has returned to the wild" placeholder
- **Active Challenges feed** on homepage — shows any Crown with open 48h window, vote tallies, countdown
- **Recent Posts feed with infinite scroll** — chronological feed reading PostCreated events
- **USD context** for all amounts (show $X equivalent next to token amounts)
- **"First-time visitor" card** — dismissable 3-step explainer (Share → Compete → Fund Wildlife)

### Custom Domain / ENS
- The app is deployed to a raw BGIPFS gateway URL
- For a human-readable URL, the client can set up an ENS subdomain pointing to this CID
- Or use a custom domain with IPFS gateway (Cloudflare, etc.)

### Trademark Check
- "Creature Feature" overlaps with entertainment, card games, pet retail
- Recommend USPTO TESS search in classes 9, 41, 42 before significant marketing spend

### Content Permanence Disclosure
- The About page needs a disclosure that IPFS-pinned Pet/Art uploads cannot be deleted
- The onchain flag-and-hide is a UI-level remedy only

### Production Hardening
- This is a prototype. Before launch with real users/money, recommend:
  - A HumanQA audit (frontend polish: token picker clarity, approval flows, slippage messaging, bid refund states)
  - Load testing the event-reading patterns (no subgraph, reads directly from wagmi watchers)
  - Review Endaoment integration once WWF entity is deployed on Base

## Client Actions Required

1. The contract owner is already set to your wallet. No acceptOwnership() needed.
2. To update prices/split after deployment: call admin functions via Basescan
3. Optionally add an ENS subdomain pointing to the IPFS CID
