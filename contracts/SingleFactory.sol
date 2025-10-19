// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ERC721Single.sol";

/// @title SingleFactory
/// @notice ERC721Single を CREATE2 でデプロイ（1コントラクト=1NFT）
contract SingleFactory {
    event Deployed(address indexed nft, bytes32 indexed salt);

    error Create2Failed();

    /// @notice 与えられたパラメータから init code の keccak256 を返す（オフチェーン検算用）
    function initCodeHash(
        string calldata name_,
        string calldata symbol_,
        string calldata initialURI,
        address initialOwner
    ) public pure returns (bytes32) {
        bytes memory bytecode = abi.encodePacked(
            type(ERC721Single).creationCode,
            abi.encode(initialOwner, name_, symbol_, initialURI)
        );
        return keccak256(bytecode);
    }

    /// @notice 予測アドレスを返す（CREATE2）
    function compute(
        bytes32 salt,
        string calldata name_,
        string calldata symbol_,
        string calldata initialURI,
        address initialOwner
    ) public view returns (address predicted) {
        bytes32 hash = initCodeHash(name_, symbol_, initialURI, initialOwner);
        // EIP-1014: keccak256(0xff ++ deployer ++ salt ++ keccak256(init_code))[12:]
        predicted = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash))
                )
            )
        );
    }

    /// @notice 既にコードがあるか（= デプロイ済みか）を返す
    function isDeployed(address addr) public view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }

    /// @notice CREATE2 で ERC721Single をデプロイ
    function deploy(
        bytes32 salt,
        string calldata name_,
        string calldata symbol_,
        string calldata initialURI,
        address initialOwner
    ) external returns (address nft) {
        bytes memory bytecode = abi.encodePacked(
            type(ERC721Single).creationCode,
            abi.encode(initialOwner, name_, symbol_, initialURI)
        );
        assembly {
            nft := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        if (nft == address(0)) revert Create2Failed();
        emit Deployed(nft, salt);
    }
}
