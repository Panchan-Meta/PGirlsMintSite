// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ERC721Collection.sol";

/*
 * CREATE2 で「コレクション1本」をデプロイ/予測するファクトリ。
 * salt は "collection-<collectionName>" などコレクション単位で固定化する想定。
 */
contract CollectionFactory {
    event Deployed(address nft, bytes32 salt);

    function deploy(
        bytes32 salt,
        string calldata name_,
        string calldata symbol_,
        address initialOwner
    ) external returns (address nft) {
        bytes memory bytecode = abi.encodePacked(
            type(ERC721Collection).creationCode,
            abi.encode(initialOwner, name_, symbol_)
        );
        assembly {
            nft := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        require(nft != address(0), "CREATE2 failed");
        emit Deployed(nft, salt);
    }

    function compute(
        bytes32 salt,
        string calldata name_,
        string calldata symbol_,
        address initialOwner
    ) external view returns (address predicted) {
        bytes memory bytecode = abi.encodePacked(
            type(ERC721Collection).creationCode,
            abi.encode(initialOwner, name_, symbol_)
        );
        bytes32 hash = keccak256(bytecode);
        predicted = address(
            uint160(
                uint(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, hash)))
            )
        );
    }
}
