// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
 * コレクション1本=1コントラクト。各アイテムは tokenId で管理。
 * 代金の受け取りはフロント（ERC20）で行い、本コントラクトはミントとURI設定のみ。
 * ※ ERC721URIStorage を使わず、自前で tokenURI を保持しシンプル化
 */
contract ERC721Collection is ERC721, Ownable {
    // 二重ミント防止
    mapping(uint256 => bool) public minted;

    // tokenURI ストレージ
    mapping(uint256 => string) private _tokenURIs;

    constructor(address initialOwner, string memory name_, string memory symbol_)
        ERC721(name_, symbol_) 
        Ownable(initialOwner)
    {}

    /// @notice 指定 tokenId を 1 回だけミントし、URI を設定する
    /// @dev price は互換用のダミー引数（支払いはフロントで実施）
    function mint(uint256 tokenId, uint256 /*price*/, string calldata uri) external {
        require(!minted[tokenId], "Already minted");
        minted[tokenId] = true;

        _safeMint(msg.sender, tokenId);
        if (bytes(uri).length != 0) {
            _setTokenURI(tokenId, uri);
        }
    }

    /* ---------- tokenURI 関連（自前実装） ---------- */

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
        string memory uri = _tokenURIs[tokenId];
        return uri;
    }

    function _setTokenURI(uint256 tokenId, string memory uri) internal {
        require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
        _tokenURIs[tokenId] = uri;
    }

    /* ---------- interface ---------- */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
