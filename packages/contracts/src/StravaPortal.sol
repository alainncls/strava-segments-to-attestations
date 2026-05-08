// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import { AbstractPortalV2 } from "@verax-attestation-registry/verax-contracts/contracts/abstracts/AbstractPortalV2.sol";
import { AttestationPayload } from "@verax-attestation-registry/verax-contracts/contracts/types/Structs.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title Strava Segment Portal
 * @author alain.linea.eth
 * @notice This contract creates attestations for completed Strava segments
 */
contract StravaPortal is AbstractPortalV2, EIP712 {
    uint256 public fee = 0.0001 ether;
    address public signerAddress;
    bytes32 public schemaId;
    mapping(bytes32 => bool) public usedAttestations;
    string private constant SIGNING_DOMAIN = "VerifyStrava";
    string private constant SIGNATURE_VERSION = "1";

    error InvalidSchema();
    error InvalidSubject();
    error SenderIsNotSubject();
    error InsufficientFee();
    error InvalidSignature();
    error SignatureExpired();
    error SignatureAlreadyUsed();
    error NotImplemented();

    struct SegmentPayload {
        uint256 segmentId;
        uint64 completionDate;
    }

    event SignerAddressUpdated(address indexed oldSigner, address indexed newSigner);
    event SchemaIdUpdated(bytes32 indexed oldSchemaId, bytes32 indexed newSchemaId);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    constructor(
        address[] memory modules,
        address router,
        address _signerAddress,
        bytes32 _schemaId
    ) AbstractPortalV2(modules, router) EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {
        signerAddress = _signerAddress;
        schemaId = _schemaId;
    }

    /**
     * @inheritdoc AbstractPortalV2
     * @dev This function checks if
     *          the subject is a valid address,
     *          and if the value sent is sufficient
     *          and if the schema ID is correct
     *          and if the payload is correctly signed
     */
    function _onAttest(
        AttestationPayload memory attestationPayload,
        bytes[] memory validationPayloads,
        uint256 value
    ) internal override {
        if (attestationPayload.subject.length != 20) revert InvalidSubject();
        address subject = address(uint160(bytes20(attestationPayload.subject)));
        if (msg.sender != subject) revert SenderIsNotSubject();

        if (value < fee) revert InsufficientFee();
        if (attestationPayload.schemaId != schemaId) revert InvalidSchema();

        SegmentPayload memory payload = abi.decode(attestationPayload.attestationData, (SegmentPayload));
        if (validationPayloads.length == 0) revert InvalidSignature();
        (bytes memory signature, uint64 deadline) = abi.decode(validationPayloads[0], (bytes, uint64));
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 attestationDigest = hashAttestation(payload.segmentId, payload.completionDate, subject);
        if (usedAttestations[attestationDigest]) revert SignatureAlreadyUsed();
        if (!verifySignature(signature, payload.segmentId, payload.completionDate, subject, deadline)) {
            revert InvalidSignature();
        }
        usedAttestations[attestationDigest] = true;
    }

    /**
     * @inheritdoc AbstractPortalV2
     */
    function _onReplace(
        bytes32 /*attestationId*/,
        AttestationPayload memory /*attestationPayload*/,
        address /*attester*/,
        uint256 /*value*/
    ) internal view override {
        if (msg.sender != portalRegistry.getPortalByAddress(address(this)).ownerAddress) revert OnlyPortalOwner();
    }

    /**
     * @inheritdoc AbstractPortalV2
     */
    function _onBulkReplace(
        bytes32[] memory /*attestationIds*/,
        AttestationPayload[] memory /*attestationsPayloads*/,
        bytes[][] memory /*validationPayloads*/
    ) internal view override {
        if (msg.sender != portalRegistry.getPortalByAddress(address(this)).ownerAddress) revert OnlyPortalOwner();
    }

    /**
     * @inheritdoc AbstractPortalV2
     * @dev This function is not implemented
     */
    function _onBulkAttest(
        AttestationPayload[] memory /*attestationsPayloads*/,
        bytes[][] memory /*validationPayloads*/
    ) internal pure override {
        revert NotImplemented();
    }

    /**
     * @inheritdoc AbstractPortalV2
     * @dev Only the Portal owner can revoke attestations
     */
    function _onRevoke(bytes32 /*attestationId*/) internal view override {
        if (msg.sender != portalRegistry.getPortalByAddress(address(this)).ownerAddress) revert OnlyPortalOwner();
    }

    /**
     * @inheritdoc AbstractPortalV2
     * @dev Only the Portal owner can revoke attestations
     */
    function _onBulkRevoke(bytes32[] memory /*attestationIds*/) internal view override {
        if (msg.sender != portalRegistry.getPortalByAddress(address(this)).ownerAddress) revert OnlyPortalOwner();
    }

    /**
     * @notice Set the fee required to attest
     * @param attestationFee The fee required to attest
     */
    function setFee(uint256 attestationFee) public onlyPortalOwner {
        emit FeeUpdated(fee, attestationFee);
        fee = attestationFee;
    }

    /**
     * @notice Set the signer address for signature verification
     * @param _signerAddress The new signer address
     */
    function setSignerAddress(address _signerAddress) public onlyPortalOwner {
        emit SignerAddressUpdated(signerAddress, _signerAddress);
        signerAddress = _signerAddress;
    }

    /**
     * @notice Set the schema ID for attestations
     * @param _schemaId The new schema ID
     */
    function setSchemaId(bytes32 _schemaId) public onlyPortalOwner {
        emit SchemaIdUpdated(schemaId, _schemaId);
        schemaId = _schemaId;
    }

    /**
     * @notice Verify the signature of a segment attestation
     * @param signature The signature to verify
     * @param segmentId The Strava segment ID
     * @param completionDate The timestamp of the segment effort
     * @param subject The address of the attester
     * @return True if the signature is valid
     */
    function verifySignature(
        bytes memory signature,
        uint256 segmentId,
        uint64 completionDate,
        address subject,
        uint64 deadline
    ) internal view returns (bool) {
        bytes32 digest = hashSegment(segmentId, completionDate, subject, deadline);
        address signer = ECDSA.recover(digest, signature);
        return signer == signerAddress;
    }

    function hashSegment(
        uint256 segmentId,
        uint64 completionDate,
        address subject,
        uint64 deadline
    ) internal view returns (bytes32) {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256("Segment(uint256 segmentId,uint64 completionDate,address subject,uint64 deadline)"),
                    segmentId,
                    completionDate,
                    subject,
                    deadline
                )
            )
        );
        return digest;
    }

    function hashAttestation(
        uint256 segmentId,
        uint64 completionDate,
        address subject
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(segmentId, completionDate, subject));
    }

    /**
     * @notice Withdraw collected fees
     */
    function withdraw() public onlyPortalOwner {
        address portalOwner = portalRegistry.getPortalOwner(address(this));
        (bool success, ) = payable(portalOwner).call{ value: address(this).balance }("");
        require(success, "Transfer failed");
    }
}
