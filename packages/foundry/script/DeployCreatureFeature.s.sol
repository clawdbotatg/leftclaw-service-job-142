// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { CreatureFeature } from "../contracts/CreatureFeature.sol";

/**
 * @notice Deploy script for CreatureFeature
 * @dev Inherits ScaffoldETHDeploy which:
 *      - Includes forge-std/Script.sol for deployment
 *      - Includes ScaffoldEthDeployerRunner modifier
 *      - Provides `deployer` variable
 *
 * Usage:
 *   yarn deploy --file DeployCreatureFeature.s.sol
 *   yarn deploy --file DeployCreatureFeature.s.sol --network base
 */
contract DeployCreatureFeature is ScaffoldETHDeploy {
    /// @dev Owner of the deployed CreatureFeature on production. The deployer can be different;
    ///      the contract uses standard OZ Ownable so the constructor sets this address as owner directly.
    address constant CLIENT_OWNER = 0xC99F74bC7c065d8c51BD724Da898d44F775a8a19;

    function run() external ScaffoldEthDeployerRunner {
        CreatureFeature cf = new CreatureFeature(CLIENT_OWNER);
        deployments.push(Deployment({ name: "CreatureFeature", addr: address(cf) }));
    }
}
