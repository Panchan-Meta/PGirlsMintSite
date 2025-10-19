// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice 既に1枚ミント済み
error AlreadyMinted();

/// @title ERC721Single
/// @notice 1コントラクト = 1枚（tokenId = 1 固定）のシンプルな ERC721
/// @dev 支払いはフロント側で実施（PGIRLS → TREASURY 送金）。本コントラクトは所有トークンの発行のみを担う。
contract ERC721Single is ERC721, ERC721URIStorage, Ownable {
    /// @dev 4つ目の initialTokenURI は ABI 互換のため受け取るが、ここでは使わない。
    constructor(
        address initialOwner,
        string memory name_,
        string memory symbol_,
        string memory /* initialTokenURI */
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        // ここではミントしない（購入者が mint() を呼ぶ）
    }

    /// @notice 1回だけ、購入者 (msg.sender) にミントする
    /// @param price ダミー（ABI互換用）。ロジックでは未使用
    /// @param uri   ミント時に設定する tokenURI（空なら未設定）
    function mint(uint256 price, string memory uri) external {
        // 未使用警告が気になる場合は次行をコメント解除：
        // price;

        // OZ v5 では _exists が無いので _ownerOf を利用
        if (_ownerOf(1) != address(0)) revert AlreadyMinted();

        _safeMint(msg.sender, 1);          // ★ 購入者にミント（owner() ではない）
        if (bytes(uri).length != 0) {
            _setTokenURI(1, uri);          // URIが渡された場合のみ設定
        }
    }

    /// @notice オーナーのみ tokenURI を更新可能（運用・修正用）
    function updateTokenURI(uint256 tokenId, string calldata newURI) external onlyOwner {
        _setTokenURI(tokenId, newURI);
    }

    // ===== 必要な override =====
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return ERC721URIStorage.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
