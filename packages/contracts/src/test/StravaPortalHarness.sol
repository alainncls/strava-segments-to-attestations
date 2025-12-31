// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import { StravaPortal } from "../StravaPortal.sol";

/**
 * @title Strava Portal Test Harness
 * @notice Exposes internal functions for testing
 */
contract StravaPortalHarness is StravaPortal {
    constructor(
        address[] memory modules,
        address router,
        address _signerAddress,
        bytes32 _schemaId
    ) StravaPortal(modules, router, _signerAddress, _schemaId) {}

    /**
     * @notice Exposes verifySignature for testing
     */
    function exposed_verifySignature(
        bytes memory signature,
        uint256 segmentId,
        address subject
    ) external view returns (bool) {
        return verifySignature(signature, segmentId, subject);
    }
}
