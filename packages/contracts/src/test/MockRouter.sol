// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import { AttestationPayload } from "@verax-attestation-registry/verax-contracts/contracts/types/Structs.sol";

/**
 * @title Mock Attestation Registry
 * @notice Minimal mock for testing
 */
contract MockAttestationRegistry {
    function attest(
        AttestationPayload memory /*attestationPayload*/,
        address /*attester*/
    ) external payable returns (bytes32) {
        return keccak256(abi.encodePacked(block.timestamp, msg.sender));
    }

    function getAttestationIdCounter() external pure returns (uint32) {
        return 1;
    }
}

/**
 * @title Mock Module Registry
 * @notice Minimal mock for testing
 */
contract MockModuleRegistry {
    function runModulesV2(
        address[] memory /*moduleAddresses*/,
        AttestationPayload memory /*attestationPayload*/,
        bytes[] memory /*validationPayloads*/,
        uint256 /*value*/,
        address /*msgSender*/,
        address /*attester*/,
        uint8 /*operationType*/
    ) external {}

    function bulkRunModulesV2(
        address[] memory /*moduleAddresses*/,
        AttestationPayload[] memory /*attestationsPayloads*/,
        bytes[][] memory /*validationPayloads*/,
        address /*msgSender*/,
        address /*attester*/,
        uint8 /*operationType*/
    ) external {}
}

/**
 * @title Mock Portal Registry
 * @notice Minimal mock for testing
 */
contract MockPortalRegistry {
    struct Portal {
        address id;
        address ownerAddress;
        address[] modules;
        bool isRevocable;
        string name;
        string description;
        string ownerName;
    }

    mapping(address => Portal) private portals;

    function setPortal(address portalAddress, address owner) external {
        portals[portalAddress] = Portal({
            id: portalAddress,
            ownerAddress: owner,
            modules: new address[](0),
            isRevocable: true,
            name: "Test Portal",
            description: "Test",
            ownerName: "Test Owner"
        });
    }

    function getPortalByAddress(address portalAddress) external view returns (Portal memory) {
        return portals[portalAddress];
    }

    function getPortalOwner(address portalAddress) external view returns (address) {
        return portals[portalAddress].ownerAddress;
    }

    function isRegistered(address /*portalAddress*/) external pure returns (bool) {
        return true;
    }
}

/**
 * @title Mock Router
 * @notice Minimal mock for Verax Router
 */
contract MockRouter {
    MockAttestationRegistry public attestationRegistry;
    MockModuleRegistry public moduleRegistry;
    MockPortalRegistry public portalRegistry;

    constructor() {
        attestationRegistry = new MockAttestationRegistry();
        moduleRegistry = new MockModuleRegistry();
        portalRegistry = new MockPortalRegistry();
    }

    function getPortalRegistry() external view returns (address) {
        return address(portalRegistry);
    }

    function getModuleRegistry() external view returns (address) {
        return address(moduleRegistry);
    }

    function getAttestationRegistry() external view returns (address) {
        return address(attestationRegistry);
    }
}
