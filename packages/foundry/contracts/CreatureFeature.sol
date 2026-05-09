// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IQuoterV2 {
    struct QuoteExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amount;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactOutputSingle(QuoteExactOutputSingleParams memory params)
        external
        returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IEndaomentEntity {
    function donate(uint256 amount) external;
}

/**
 * @title CreatureFeature
 * @notice Wildlife crown game on Base. Posts compete in categories for crown ownership.
 *         Spotlight slots run as continuous 24h auctions. Payments split: burn / treasury / WWF charity.
 */
contract CreatureFeature is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ External addresses (Base mainnet, hardcoded) ============
    address public constant CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant WETH = 0x4200000000000000000000000000000000000006;
    address public constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address public constant QUOTER_V2 = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint24 public constant CLAWD_USDC_FEE = 3000;
    uint24 public constant WETH_USDC_FEE = 500;

    // ============ Constants / immutables ============
    uint64 public constant CHALLENGE_DURATION = 48 hours;
    uint64 public constant CROWN_COOLDOWN = 1 hours;
    uint64 public constant SPOTLIGHT_DURATION = 24 hours;
    uint64 public constant SPOTLIGHT_ANTISNIPE_WINDOW = 5 minutes;
    uint16 public constant SPOTLIGHT_MIN_INCREMENT_BPS = 1000; // 10%
    uint16 public constant CLAWD_DISCOUNT_BPS = 1500; // 15%
    uint16 public constant BPS_DENOM = 10000;

    // ============ Enums ============
    enum Tag {
        Wild,
        Pet,
        Art
    }

    enum SourceType {
        INAT,
        IPFS
    }

    // ContextType values for ImageSnapshotSet event
    uint8 internal constant CTX_CROWN = 1;
    uint8 internal constant CTX_SPOTLIGHT = 2;

    // ============ Structs ============
    struct Post {
        uint256 id;
        address author;
        Tag tag;
        bytes32 source;
        SourceType sourceType;
        uint64 createdAt;
        uint32 flagCount;
        bool hidden;
    }

    struct Category {
        uint256 id;
        string name;
        address creator;
        uint64 createdAt;
    }

    struct CrownState {
        uint256 championPostId;
        address championOwner;
        uint256 challengerPostId;
        address challengerOwner;
        uint256 championVotes;
        uint256 challengerVotes;
        uint64 challengeStart;
        uint64 cooldownEnd;
        uint64 reignStart;
        uint256 challengeRound;
        bytes32 imageSnapshotCID;
    }

    struct SpotlightSlot {
        uint256 slotId;
        uint64 startsAt;
        uint64 endsAt;
        uint256 currentBid;
        address currentBidder;
        uint256 currentBidPostId;
        address currentBidToken;
        bytes32 imageSnapshotCID;
        bool resolved;
    }

    struct UserStats {
        uint256 postsCount;
        uint256 crownsHeld;
        uint256 crownsWonLifetime;
        uint256 challengesWon;
        uint256 totalReignSeconds;
        uint256 spotlightsWon;
    }

    struct Records {
        uint256 longestReignSeconds;
        address longestReignChampion;
        uint256 longestReignPostId;
        uint256 mostDefensesCount;
        address mostDefensesChampion;
        address firstEverWinner;
        uint256 firstEverWinnerPostId;
    }

    // ============ Storage ============
    uint256 public postCounter;
    uint256 public categoryCounter;
    uint256 public currentSpotlightSlotId;

    mapping(uint256 => Post) public posts;
    mapping(address => uint256[]) public userPosts;
    mapping(uint256 => Category) public categories;
    mapping(bytes32 => bool) public categoryNameTaken;
    mapping(uint256 => CrownState) public crowns;
    mapping(uint256 => Records) public categoryRecords;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public crownVoteCast;
    mapping(uint256 => mapping(uint256 => bool)) public postLostInCategory;
    mapping(uint256 => uint256) public postCrownWins;
    mapping(uint256 => uint256) public postDefenseCount; // defenses by current champion (per category, by postId)
    mapping(address => UserStats) public userStats;
    mapping(uint256 => SpotlightSlot) public spotlights;
    mapping(uint256 => mapping(address => bool)) public flagged;

    // ============ Owner-configurable ============
    address public treasury;
    uint256 public priceCreateCategory;
    uint256 public pricePost;
    uint256 public priceVote;
    uint256 public priceChallenge;
    uint256 public priceFlag;
    uint256 public priceSpotlightFloor;

    uint16 public burnBps;
    uint16 public treasuryBps;
    uint16 public charityBps;

    uint16 public slippageBps;
    uint32 public flagThreshold;

    address public orgFundFactory;
    address public wwfEntity;

    // ============ Events ============
    event PostCreated(uint256 indexed postId, address indexed author, Tag tag, bytes32 source);
    event PostFlagged(uint256 indexed postId, address indexed flagger, uint32 newCount);
    event CategoryCreated(uint256 indexed categoryId, string name, address indexed creator);
    event ChampionCrowned(uint256 indexed categoryId, uint256 indexed postId, address indexed owner);
    event ChallengeStarted(uint256 indexed categoryId, uint256 indexed challengerPostId, address indexed challenger);
    event VoteCast(uint256 indexed categoryId, address indexed voter, bool forChallenger);
    event ChallengeResolved(
        uint256 indexed categoryId,
        uint256 winnerPostId,
        address indexed winner,
        uint256 championVotes,
        uint256 challengerVotes
    );
    event SpotlightBid(
        uint256 indexed slotId, address indexed bidder, uint256 amount, address token, uint256 postId
    );
    event SpotlightResolved(
        uint256 indexed slotId, address indexed winner, uint256 winningPostId, uint256 amount, address token
    );
    event PaymentProcessed(
        address indexed payer,
        address token,
        uint256 usdAmount,
        uint256 burnAmount,
        uint256 treasuryAmount,
        uint256 charityAmount
    );
    event ImageSnapshotSet(uint256 indexed contextId, bytes32 ipfsCID, uint8 contextType);
    event TreasuryUpdated(address indexed newTreasury);
    event PricesUpdated();
    event SplitBpsUpdated(uint16 burn, uint16 treasury, uint16 charity);
    event FlagThresholdUpdated(uint32 threshold);
    event SlippageBpsUpdated(uint16 slippage);
    event EndaomentRefsUpdated(address orgFundFactory, address wwfEntity);

    // ============ Constructor ============
    constructor(address owner_) Ownable(owner_) {
        // defaults
        treasury = 0x90eF2A9211A3E7CE788561E5af54C76B0Fa3aEd0;

        priceCreateCategory = 1_000_000; // $1.00
        pricePost = 75_000; // $0.075
        priceVote = 100_000; // $0.10
        priceChallenge = 500_000; // $0.50
        priceFlag = 100_000; // $0.10
        priceSpotlightFloor = 250_000; // $0.25

        burnBps = 4000; // 40%
        treasuryBps = 3000; // 30%
        charityBps = 3000; // 30%

        slippageBps = 100; // 1%
        flagThreshold = 5;

        wwfEntity = 0x3c57365D198586d6Bc0e3e3f6b9a63E17425aC52;
        orgFundFactory = 0x10fD9348136dCea154F752fe0B6dB45Fc298A589;

        // Pre-seed 10 categories (creator = address(0))
        _seedCategory("birds");
        _seedCategory("mammals");
        _seedCategory("reptiles");
        _seedCategory("amphibians");
        _seedCategory("fish");
        _seedCategory("insects");
        _seedCategory("plants");
        _seedCategory("fungi");
        _seedCategory("marine life");
        _seedCategory("pets & companions");

        // Start first spotlight slot
        currentSpotlightSlotId = 1;
        spotlights[1] = SpotlightSlot({
            slotId: 1,
            startsAt: uint64(block.timestamp),
            endsAt: uint64(block.timestamp) + SPOTLIGHT_DURATION,
            currentBid: 0,
            currentBidder: address(0),
            currentBidPostId: 0,
            currentBidToken: address(0),
            imageSnapshotCID: bytes32(0),
            resolved: false
        });
    }

    function _seedCategory(string memory normalizedName) internal {
        categoryCounter += 1;
        bytes32 nameHash = keccak256(bytes(normalizedName));
        categoryNameTaken[nameHash] = true;
        categories[categoryCounter] = Category({
            id: categoryCounter,
            name: normalizedName,
            creator: address(0),
            createdAt: uint64(block.timestamp)
        });
        emit CategoryCreated(categoryCounter, normalizedName, address(0));
    }

    // ============ Pricing / Payment ============

    /**
     * @notice Returns the token amount required to settle `usdAmount` (1e6 units of USD).
     *         For CLAWD applies the 15% discount.
     */
    function _quote(uint256 usdAmount, address token) internal returns (uint256) {
        if (token == USDC) {
            return usdAmount;
        }

        if (token == CLAWD) {
            IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: CLAWD,
                tokenOut: USDC,
                amount: usdAmount,
                fee: CLAWD_USDC_FEE,
                sqrtPriceLimitX96: 0
            });
            (uint256 amountIn,,,) = IQuoterV2(QUOTER_V2).quoteExactOutputSingle(params);
            // apply 15% discount
            return (amountIn * (BPS_DENOM - CLAWD_DISCOUNT_BPS)) / BPS_DENOM;
        }

        if (token == address(0)) {
            // ETH: quoter uses WETH
            IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: WETH,
                tokenOut: USDC,
                amount: usdAmount,
                fee: WETH_USDC_FEE,
                sqrtPriceLimitX96: 0
            });
            (uint256 amountIn,,,) = IQuoterV2(QUOTER_V2).quoteExactOutputSingle(params);
            return amountIn;
        }

        revert("unsupported token");
    }

    /**
     * @notice Collects payment in `token`, splits into burn/treasury/charity, performs swaps as needed.
     */
    function _processPayment(uint256 usdAmount, address token, address payer) internal {
        uint256 tokenAmount = _quote(usdAmount, token);
        require(tokenAmount > 0, "zero quote");

        if (token == address(0)) {
            require(msg.value >= tokenAmount, "insufficient ETH");
            // refund excess to payer
            uint256 excess = msg.value - tokenAmount;
            if (excess > 0) {
                (bool ok,) = payable(payer).call{ value: excess }("");
                require(ok, "refund failed");
            }
        } else {
            require(msg.value == 0, "no ETH for ERC20");
            IERC20(token).safeTransferFrom(payer, address(this), tokenAmount);
        }

        uint256 burnAmt = (tokenAmount * burnBps) / BPS_DENOM;
        uint256 treasuryAmt = (tokenAmount * treasuryBps) / BPS_DENOM;
        uint256 charityAmt = tokenAmount - burnAmt - treasuryAmt;

        _routeBurn(token, burnAmt);
        _routeTreasury(token, treasuryAmt);
        _routeCharity(token, charityAmt);

        emit PaymentProcessed(payer, token, usdAmount, burnAmt, treasuryAmt, charityAmt);
    }

    function _routeBurn(address token, uint256 amount) internal {
        if (amount == 0) return;

        if (token == CLAWD) {
            IERC20(CLAWD).safeTransfer(BURN_ADDRESS, amount);
            return;
        }

        if (token == address(0)) {
            // ETH -> CLAWD via WETH/USDC -> CLAWD path... use direct WETH/CLAWD if available; otherwise routes
            // Simpler: WETH->USDC (500), then USDC->CLAWD (3000). Use exactInputSingle twice.
            // Wrap ETH->WETH first
            IWETH9(WETH).deposit{ value: amount }();
            IERC20(WETH).forceApprove(SWAP_ROUTER, amount);
            uint256 usdcOut = ISwapRouter02(SWAP_ROUTER).exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: WETH,
                    tokenOut: USDC,
                    fee: WETH_USDC_FEE,
                    recipient: address(this),
                    amountIn: amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            if (usdcOut > 0) {
                IERC20(USDC).forceApprove(SWAP_ROUTER, usdcOut);
                ISwapRouter02(SWAP_ROUTER).exactInputSingle(
                    ISwapRouter02.ExactInputSingleParams({
                        tokenIn: USDC,
                        tokenOut: CLAWD,
                        fee: CLAWD_USDC_FEE,
                        recipient: BURN_ADDRESS,
                        amountIn: usdcOut,
                        amountOutMinimum: 0,
                        sqrtPriceLimitX96: 0
                    })
                );
            }
            return;
        }

        if (token == USDC) {
            IERC20(USDC).forceApprove(SWAP_ROUTER, amount);
            ISwapRouter02(SWAP_ROUTER).exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: USDC,
                    tokenOut: CLAWD,
                    fee: CLAWD_USDC_FEE,
                    recipient: BURN_ADDRESS,
                    amountIn: amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            return;
        }

        revert("burn: unsupported token");
    }

    function _routeTreasury(address token, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok,) = payable(treasury).call{ value: amount }("");
            require(ok, "treasury ETH xfer failed");
        } else {
            IERC20(token).safeTransfer(treasury, amount);
        }
    }

    function _routeCharity(address token, uint256 amount) internal {
        if (amount == 0) return;

        bool entityDeployed = wwfEntity != address(0) && wwfEntity.code.length > 0;

        if (token == address(0)) {
            if (entityDeployed) {
                // best-effort: forward ETH to entity. If donate fails, fall back to treasury.
                (bool ok,) = payable(wwfEntity).call{ value: amount }("");
                if (!ok) {
                    (bool ok2,) = payable(treasury).call{ value: amount }("");
                    require(ok2, "charity fallback failed");
                }
            } else {
                (bool ok,) = payable(treasury).call{ value: amount }("");
                require(ok, "charity fallback failed");
            }
            return;
        }

        if (token == CLAWD) {
            // swap CLAWD -> USDC then route as USDC
            IERC20(CLAWD).forceApprove(SWAP_ROUTER, amount);
            uint256 usdcOut = ISwapRouter02(SWAP_ROUTER).exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: CLAWD,
                    tokenOut: USDC,
                    fee: CLAWD_USDC_FEE,
                    recipient: address(this),
                    amountIn: amount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            _sendUsdcCharity(usdcOut, entityDeployed);
            return;
        }

        if (token == USDC) {
            _sendUsdcCharity(amount, entityDeployed);
            return;
        }

        revert("charity: unsupported token");
    }

    function _sendUsdcCharity(uint256 amount, bool entityDeployed) internal {
        if (amount == 0) return;
        if (entityDeployed) {
            // approve + donate; fall back to treasury on failure
            IERC20(USDC).forceApprove(wwfEntity, amount);
            try IEndaomentEntity(wwfEntity).donate(amount) {
                return;
            } catch {
                IERC20(USDC).forceApprove(wwfEntity, 0);
                IERC20(USDC).safeTransfer(treasury, amount);
            }
        } else {
            IERC20(USDC).safeTransfer(treasury, amount);
        }
    }

    // ============ Posts ============
    function createPost(Tag tag, bytes32 source, SourceType sourceType, address payToken)
        external
        payable
        nonReentrant
    {
        _processPayment(pricePost, payToken, msg.sender);

        postCounter += 1;
        posts[postCounter] = Post({
            id: postCounter,
            author: msg.sender,
            tag: tag,
            source: source,
            sourceType: sourceType,
            createdAt: uint64(block.timestamp),
            flagCount: 0,
            hidden: false
        });
        userPosts[msg.sender].push(postCounter);
        userStats[msg.sender].postsCount += 1;

        emit PostCreated(postCounter, msg.sender, tag, source);
    }

    function flagPost(uint256 postId, address payToken) external payable nonReentrant {
        Post storage p = posts[postId];
        require(p.id != 0, "post !exist");
        require(!flagged[postId][msg.sender], "already flagged");

        _processPayment(priceFlag, payToken, msg.sender);

        flagged[postId][msg.sender] = true;
        unchecked {
            p.flagCount += 1;
        }
        if (p.flagCount >= flagThreshold) {
            p.hidden = true;
        }

        emit PostFlagged(postId, msg.sender, p.flagCount);
    }

    // ============ Categories ============
    function createCategory(string calldata name, address payToken) external payable nonReentrant {
        _processPayment(priceCreateCategory, payToken, msg.sender);
        _createCategory(name, msg.sender);
    }

    function ownerCreateCategory(string calldata name) external onlyOwner {
        _createCategory(name, address(0));
    }

    function _createCategory(string calldata name, address creator) internal {
        string memory normalized = _normalize(name);
        bytes memory nb = bytes(normalized);
        require(nb.length > 0 && nb.length <= 64, "bad name length");
        bytes32 nameHash = keccak256(nb);
        require(!categoryNameTaken[nameHash], "name taken");
        categoryNameTaken[nameHash] = true;

        categoryCounter += 1;
        categories[categoryCounter] = Category({
            id: categoryCounter,
            name: normalized,
            creator: creator,
            createdAt: uint64(block.timestamp)
        });

        emit CategoryCreated(categoryCounter, normalized, creator);
    }

    /**
     * @dev Normalizes ASCII names: trims leading/trailing whitespace, lowercases A-Z.
     *      Non-ASCII bytes pass through unchanged (UTF-8 multibyte sequences preserved).
     */
    function _normalize(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 start = 0;
        uint256 end = b.length;
        while (start < end && _isWhitespace(b[start])) {
            start += 1;
        }
        while (end > start && _isWhitespace(b[end - 1])) {
            end -= 1;
        }
        bytes memory out = new bytes(end - start);
        for (uint256 i = 0; i < out.length; i++) {
            bytes1 c = b[start + i];
            if (c >= 0x41 && c <= 0x5A) {
                // 'A'..'Z' -> +0x20
                out[i] = bytes1(uint8(c) + 32);
            } else {
                out[i] = c;
            }
        }
        return string(out);
    }

    function _isWhitespace(bytes1 c) internal pure returns (bool) {
        return c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D;
    }

    // ============ Crowns ============
    function submitFirstChampion(uint256 categoryId, uint256 postId, address payToken)
        external
        payable
        nonReentrant
    {
        Category storage cat = categories[categoryId];
        require(cat.id != 0, "category !exist");
        CrownState storage cs = crowns[categoryId];
        require(cs.championPostId == 0, "champion exists");
        Post storage p = posts[postId];
        require(p.id != 0, "post !exist");
        require(p.author == msg.sender, "!author");
        require(!p.hidden, "post hidden");

        _processPayment(priceChallenge, payToken, msg.sender);

        cs.championPostId = postId;
        cs.championOwner = msg.sender;
        cs.reignStart = uint64(block.timestamp);
        cs.cooldownEnd = 0;

        UserStats storage us = userStats[msg.sender];
        us.crownsHeld += 1;
        us.crownsWonLifetime += 1;
        postCrownWins[postId] += 1;

        Records storage r = categoryRecords[categoryId];
        if (r.firstEverWinner == address(0)) {
            r.firstEverWinner = msg.sender;
            r.firstEverWinnerPostId = postId;
        }

        emit ChampionCrowned(categoryId, postId, msg.sender);
    }

    function challengeCrown(uint256 categoryId, uint256 postId, address payToken) external payable nonReentrant {
        Category storage cat = categories[categoryId];
        require(cat.id != 0, "category !exist");
        CrownState storage cs = crowns[categoryId];
        require(cs.championPostId != 0, "no champion");
        require(
            cs.challengeStart == 0 || block.timestamp > cs.challengeStart + CHALLENGE_DURATION,
            "active challenge"
        );
        require(block.timestamp >= cs.cooldownEnd, "cooldown");
        require(!postLostInCategory[categoryId][postId], "post lost here");
        require(postId != cs.championPostId, "is champion");

        Post storage p = posts[postId];
        require(p.id != 0, "post !exist");
        require(p.author == msg.sender, "!author");
        require(!p.hidden, "post hidden");

        _processPayment(priceChallenge, payToken, msg.sender);

        cs.challengerPostId = postId;
        cs.challengerOwner = msg.sender;
        cs.challengeStart = uint64(block.timestamp);
        cs.challengeRound += 1;
        cs.championVotes = 0;
        cs.challengerVotes = 0;

        emit ChallengeStarted(categoryId, postId, msg.sender);
    }

    function voteOnCrown(uint256 categoryId, bool forChallenger, address payToken) external payable nonReentrant {
        CrownState storage cs = crowns[categoryId];
        require(cs.challengeStart != 0, "no challenge");
        require(block.timestamp <= cs.challengeStart + CHALLENGE_DURATION, "challenge ended");
        require(!crownVoteCast[categoryId][cs.challengeRound][msg.sender], "already voted");

        _processPayment(priceVote, payToken, msg.sender);

        crownVoteCast[categoryId][cs.challengeRound][msg.sender] = true;
        if (forChallenger) {
            cs.challengerVotes += 1;
        } else {
            cs.championVotes += 1;
        }

        emit VoteCast(categoryId, msg.sender, forChallenger);
    }

    function resolveCrown(uint256 categoryId) external nonReentrant {
        CrownState storage cs = crowns[categoryId];
        require(cs.challengeStart != 0, "no challenge");
        require(block.timestamp > cs.challengeStart + CHALLENGE_DURATION, "not ended");

        bool challengerWins = cs.challengerVotes > cs.championVotes;

        uint256 challengerPostId = cs.challengerPostId;
        address challengerOwner = cs.challengerOwner;
        uint256 oldChampionPostId = cs.championPostId;
        address oldChampionOwner = cs.championOwner;
        uint64 oldReignStart = cs.reignStart;
        uint256 championVotes = cs.championVotes;
        uint256 challengerVotes = cs.challengerVotes;

        Records storage r = categoryRecords[categoryId];

        if (challengerWins) {
            // record reign length for old champion
            uint256 reignSeconds = block.timestamp - oldReignStart;
            userStats[oldChampionOwner].totalReignSeconds += reignSeconds;
            if (reignSeconds > r.longestReignSeconds) {
                r.longestReignSeconds = reignSeconds;
                r.longestReignChampion = oldChampionOwner;
                r.longestReignPostId = oldChampionPostId;
            }

            postLostInCategory[categoryId][oldChampionPostId] = true;

            // Update userStats
            UserStats storage oldUs = userStats[oldChampionOwner];
            if (oldUs.crownsHeld > 0) oldUs.crownsHeld -= 1;
            UserStats storage newUs = userStats[challengerOwner];
            newUs.crownsHeld += 1;
            newUs.crownsWonLifetime += 1;
            newUs.challengesWon += 1;

            postCrownWins[challengerPostId] += 1;

            // Set new champion
            cs.championPostId = challengerPostId;
            cs.championOwner = challengerOwner;
            cs.reignStart = uint64(block.timestamp);
            // reset defense count for new champion's post
            postDefenseCount[challengerPostId] = 0;

            if (r.firstEverWinner == address(0)) {
                r.firstEverWinner = challengerOwner;
                r.firstEverWinnerPostId = challengerPostId;
            }

            emit ChampionCrowned(categoryId, challengerPostId, challengerOwner);
        } else {
            // defender holds; mark challenger's post as lost in this category
            postLostInCategory[categoryId][challengerPostId] = true;
            uint256 newDefenses = postDefenseCount[oldChampionPostId] + 1;
            postDefenseCount[oldChampionPostId] = newDefenses;
            if (newDefenses > r.mostDefensesCount) {
                r.mostDefensesCount = newDefenses;
                r.mostDefensesChampion = oldChampionOwner;
            }
        }

        // Determine winner data for event before clearing
        uint256 winnerPostId = challengerWins ? challengerPostId : oldChampionPostId;
        address winnerAddr = challengerWins ? challengerOwner : oldChampionOwner;

        // Clear challenge state
        cs.challengerPostId = 0;
        cs.challengerOwner = address(0);
        cs.challengeStart = 0;
        cs.championVotes = 0;
        cs.challengerVotes = 0;
        cs.cooldownEnd = uint64(block.timestamp) + CROWN_COOLDOWN;

        emit ChallengeResolved(categoryId, winnerPostId, winnerAddr, championVotes, challengerVotes);
    }

    function setCrownImageSnapshot(uint256 categoryId, bytes32 ipfsCID) external {
        CrownState storage cs = crowns[categoryId];
        require(cs.championPostId != 0, "no champion");
        require(
            msg.sender == cs.championOwner || block.timestamp <= cs.reignStart + 1 hours,
            "not allowed"
        );
        cs.imageSnapshotCID = ipfsCID;
        emit ImageSnapshotSet(categoryId, ipfsCID, CTX_CROWN);
    }

    // ============ Spotlight ============
    function bidSpotlight(uint256 postId, address payToken, uint256 maxAmount) external payable nonReentrant {
        // Roll over slot if previous one ended without bids and was never resolved
        SpotlightSlot storage slot = spotlights[currentSpotlightSlotId];
        if (block.timestamp > slot.endsAt) {
            // If it has a winner, require explicit resolution first; otherwise auto-roll empty slot
            require(slot.currentBidder == address(0), "resolve previous first");
            // start a fresh empty slot
            slot.startsAt = uint64(block.timestamp);
            slot.endsAt = uint64(block.timestamp) + SPOTLIGHT_DURATION;
        }

        Post storage p = posts[postId];
        require(p.id != 0, "post !exist");
        require(!p.hidden, "post hidden");

        // floor in payToken
        uint256 floorAmount = _quote(priceSpotlightFloor, payToken);

        // min increment relative to current bid (in same units only if same token)
        uint256 minIncrement;
        if (slot.currentBidder == address(0)) {
            minIncrement = floorAmount;
        } else if (slot.currentBidToken == payToken) {
            minIncrement = (slot.currentBid * (BPS_DENOM + SPOTLIGHT_MIN_INCREMENT_BPS)) / BPS_DENOM;
            if (minIncrement < floorAmount) minIncrement = floorAmount;
        } else {
            // different token: just enforce floor (cross-token comparison out of scope)
            minIncrement = floorAmount;
        }

        require(maxAmount >= minIncrement, "bid too low");

        // Anti-snipe: extend if within window
        if (slot.endsAt - block.timestamp < SPOTLIGHT_ANTISNIPE_WINDOW) {
            slot.endsAt = uint64(block.timestamp) + SPOTLIGHT_ANTISNIPE_WINDOW;
        }

        // Capture previous bidder for refund
        address prevBidder = slot.currentBidder;
        uint256 prevBid = slot.currentBid;
        address prevToken = slot.currentBidToken;

        // Accept new bid (CEI: state first, then external)
        slot.currentBid = maxAmount;
        slot.currentBidder = msg.sender;
        slot.currentBidPostId = postId;
        slot.currentBidToken = payToken;

        // Pull funds
        if (payToken == address(0)) {
            require(msg.value >= maxAmount, "insufficient ETH");
            uint256 excess = msg.value - maxAmount;
            if (excess > 0) {
                (bool ok,) = payable(msg.sender).call{ value: excess }("");
                require(ok, "refund excess failed");
            }
        } else {
            require(msg.value == 0, "no ETH for ERC20");
            IERC20(payToken).safeTransferFrom(msg.sender, address(this), maxAmount);
        }

        // Refund previous bidder
        if (prevBidder != address(0) && prevBid > 0) {
            if (prevToken == address(0)) {
                (bool ok,) = payable(prevBidder).call{ value: prevBid }("");
                require(ok, "prev refund failed");
            } else {
                IERC20(prevToken).safeTransfer(prevBidder, prevBid);
            }
        }

        emit SpotlightBid(slot.slotId, msg.sender, maxAmount, payToken, postId);
    }

    function resolveSpotlight() external nonReentrant {
        SpotlightSlot storage slot = spotlights[currentSpotlightSlotId];
        require(block.timestamp > slot.endsAt, "not ended");
        require(!slot.resolved, "resolved");

        slot.resolved = true;

        address winner = slot.currentBidder;
        uint256 amount = slot.currentBid;
        address token = slot.currentBidToken;
        uint256 winningPostId = slot.currentBidPostId;
        uint256 slotId = slot.slotId;

        if (winner != address(0) && amount > 0) {
            // Funds already held; split now (no quote, just split tokenAmount)
            uint256 burnAmt = (amount * burnBps) / BPS_DENOM;
            uint256 treasuryAmt = (amount * treasuryBps) / BPS_DENOM;
            uint256 charityAmt = amount - burnAmt - treasuryAmt;

            _routeBurn(token, burnAmt);
            _routeTreasury(token, treasuryAmt);
            _routeCharity(token, charityAmt);

            userStats[winner].spotlightsWon += 1;

            emit PaymentProcessed(winner, token, 0, burnAmt, treasuryAmt, charityAmt);
        }

        emit SpotlightResolved(slotId, winner, winningPostId, amount, token);

        // Start a new slot
        currentSpotlightSlotId += 1;
        spotlights[currentSpotlightSlotId] = SpotlightSlot({
            slotId: currentSpotlightSlotId,
            startsAt: uint64(block.timestamp),
            endsAt: uint64(block.timestamp) + SPOTLIGHT_DURATION,
            currentBid: 0,
            currentBidder: address(0),
            currentBidPostId: 0,
            currentBidToken: address(0),
            imageSnapshotCID: bytes32(0),
            resolved: false
        });
    }

    function setSpotlightImageSnapshot(uint256 slotId, bytes32 ipfsCID) external {
        SpotlightSlot storage slot = spotlights[slotId];
        require(slot.slotId != 0, "slot !exist");
        require(slot.resolved, "not resolved");
        require(msg.sender == slot.currentBidder, "not winner");
        slot.imageSnapshotCID = ipfsCID;
        emit ImageSnapshotSet(slotId, ipfsCID, CTX_SPOTLIGHT);
    }

    // ============ Views ============
    function getUserPosts(address user) external view returns (uint256[] memory) {
        return userPosts[user];
    }

    function isPostHidden(uint256 postId) external view returns (bool) {
        Post storage p = posts[postId];
        return p.flagCount >= flagThreshold;
    }

    // ============ Admin ============
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "zero addr");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setPrices(
        uint256 _priceCreateCategory,
        uint256 _pricePost,
        uint256 _priceVote,
        uint256 _priceChallenge,
        uint256 _priceFlag,
        uint256 _priceSpotlightFloor
    ) external onlyOwner {
        priceCreateCategory = _priceCreateCategory;
        pricePost = _pricePost;
        priceVote = _priceVote;
        priceChallenge = _priceChallenge;
        priceFlag = _priceFlag;
        priceSpotlightFloor = _priceSpotlightFloor;
        emit PricesUpdated();
    }

    function setSplitBps(uint16 burn_, uint16 treasury_, uint16 charity_) external onlyOwner {
        require(uint256(burn_) + uint256(treasury_) + uint256(charity_) == BPS_DENOM, "bps != 10000");
        burnBps = burn_;
        treasuryBps = treasury_;
        charityBps = charity_;
        emit SplitBpsUpdated(burn_, treasury_, charity_);
    }

    function setFlagThreshold(uint32 threshold) external onlyOwner {
        require(threshold > 0, "zero threshold");
        flagThreshold = threshold;
        emit FlagThresholdUpdated(threshold);
    }

    function setSlippageBps(uint16 slippage) external onlyOwner {
        require(slippage <= BPS_DENOM, "bps > 10000");
        slippageBps = slippage;
        emit SlippageBpsUpdated(slippage);
    }

    function setEndaomentRefs(address _orgFundFactory, address _wwfEntity) external onlyOwner {
        orgFundFactory = _orgFundFactory;
        wwfEntity = _wwfEntity;
        emit EndaomentRefsUpdated(_orgFundFactory, _wwfEntity);
    }

    /// @notice Allow contract to receive ETH (e.g., refunds from router).
    receive() external payable { }
}
