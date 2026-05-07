// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CyberSmartLogger - immutable scan history ledger
contract CyberSmartLogger {
    struct ScanRecord {
        address user;
        string scanType;   // "url" | "ip" | "file" | "message"
        string targetHash; // sha256/keccak hash of target (privacy)
        string verdict;    // "safe" | "suspicious" | "malicious" | "unknown"
        uint8 riskScore;
        uint256 timestamp;
    }

    ScanRecord[] public records;
    mapping(address => uint256[]) public userRecords;

    event ScanLogged(
        uint256 indexed id,
        address indexed user,
        string scanType,
        string verdict,
        uint8 riskScore,
        uint256 timestamp
    );

    function logScan(
        string calldata scanType,
        string calldata targetHash,
        string calldata verdict,
        uint8 riskScore
    ) external returns (uint256 id) {
        id = records.length;
        records.push(ScanRecord(msg.sender, scanType, targetHash, verdict, riskScore, block.timestamp));
        userRecords[msg.sender].push(id);
        emit ScanLogged(id, msg.sender, scanType, verdict, riskScore, block.timestamp);
    }

    function totalScans() external view returns (uint256) { return records.length; }
    function getUserScans(address u) external view returns (uint256[] memory) { return userRecords[u]; }
    function getScan(uint256 id) external view returns (ScanRecord memory) { return records[id]; }
}
