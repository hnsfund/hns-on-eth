pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

abstract contract IDNSSEC {

    bytes public anchors;

    struct RRSetWithSignature {
        bytes rrset;
        bytes sig;
    }

    event AlgorithmUpdated(uint8 id, address addr);
    event DigestUpdated(uint8 id, address addr);
    event NSEC3DigestUpdated(uint8 id, address addr);
    event RRSetUpdated(bytes name, bytes rrset);

    function submitRRSets(bytes calldata data, bytes calldata proof) public virtual returns (bytes memory);
    function submitRRSet(RRSetWithSignature calldata input, bytes calldata proof) public virtual returns (bytes memory);
    function deleteRRSet(uint16 deleteType, bytes calldata deleteName, RRSetWithSignature calldata nsec, bytes calldata proof) public virtual;
    function deleteRRSetNSEC3(uint16 deleteType, bytes memory deleteName, RRSetWithSignature memory closestEncloser, RRSetWithSignature memory nextClosest, bytes memory dnskey) public virtual;
    function rrdata(uint16 dnstype, bytes calldata name) external virtual view returns (uint32, uint64, bytes20);
}