// contracts/Create2Deployer.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal, value=0 fixed CREATE2 deployer.
contract Create2Deployer {
    event Deployed(address indexed addr, bytes32 indexed salt);

    error EmptyBytecode();
    error Create2Failed();

    /// @notice Deploys `bytecode` via CREATE2 with `salt`.
    /// @dev value は先のコントラクトへは転送しません（常に 0）。
    function deploy(bytes32 salt, bytes memory bytecode)
        external
        payable
        returns (address addr)
    {
        if (bytecode.length == 0) revert EmptyBytecode();

        assembly {
            // value=0 で CREATE2 実行（constructor が non-payable でも安全）
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        // アドレスが 0 でないこと、かつコードが存在することを確認
        if (addr == address(0) || addr.code.length == 0) revert Create2Failed();

        emit Deployed(addr, salt);
    }

    /// @notice (既存) 事前計算: codeHash を渡す版
    function computeAddress(bytes32 salt, bytes32 bytecodeHash)
        public
        view
        returns (address predicted)
    {
        return address(
            uint160(
                uint(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff),
                            address(this),
                            salt,
                            bytecodeHash
                        )
                    )
                )
            )
        );
    }

    /// @notice 事前計算: init code をそのまま渡す版（ユーティリティ）
    function computeAddress(bytes32 salt, bytes memory bytecode)
        external
        view
        returns (address predicted)
    {
        return computeAddress(salt, keccak256(bytecode));
    }
}
