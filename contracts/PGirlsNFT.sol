// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PGirlsNFT is ERC721URIStorage, ERC2981, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public pgirlsToken;

    /**
     * 販売者の受取先。一次販売時の95%の受け取り先として利用します。
     * （運用では販売者のウォレット＝Panchan などを指定）
     */
    address public treasury;

    uint256 public nextTokenId;

    // 既定のロイヤリティ受取先（Rahab）: 5% (500 bps)
    address private constant CREATOR_ADDRESS = 0xfF280ED2B0FF2Fb64E97137F82307042B4338C79;
    uint96 private constant ROYALTY_BPS = 500; // 5%

    constructor(
        address initialOwner,
        address _pgirlsToken,
        address _treasury
    ) ERC721("PGirls NFT", "PGN") Ownable(initialOwner) {
        pgirlsToken = IERC20(_pgirlsToken);
        treasury = _treasury;
        nextTokenId = 1;

        // 既定のロイヤリティ設定（全トークンに適用）
        _setDefaultRoyalty(CREATOR_ADDRESS, ROYALTY_BPS);
    }

    /* -----------------------------
       一次販売
       price の 5% をロイヤリティ受取先（Rahab）へ、
       残り 95% を treasury（販売者）へ送金します。
    ------------------------------*/
    function mint(uint256 price, string memory tokenURI) external {
        _purchasePrimary(price, tokenURI);
    }

    function buy(uint256 price, string memory tokenURI) external {
        _purchasePrimary(price, tokenURI);
    }

    /* -----------------------------
       二次販売
       ERC2981 の royaltyInfo を使用してロイヤリティを算出し、
       残りを seller へ送金します。
    ------------------------------*/
    function buySecondary(uint256 tokenId, uint256 price) external {
        require(price > 0, "Invalid price");
        require(_exists(tokenId), "Nonexistent token");

        address seller = ownerOf(tokenId);
        require(seller != msg.sender, "Already the owner");

        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, price);
        uint256 sellerAmount = price - royaltyAmount;

        // 送金順序は任意。allowance はUI側で事前にapprove済み想定
        if (royaltyAmount > 0) {
            pgirlsToken.safeTransferFrom(msg.sender, royaltyReceiver, royaltyAmount);
        }
        pgirlsToken.safeTransferFrom(msg.sender, seller, sellerAmount);

        _safeTransfer(seller, msg.sender, tokenId, "");
    }

    /* -----------------------------
       内部: 一次販売の購入処理
    ------------------------------*/
    function _purchasePrimary(uint256 price, string memory tokenURI) internal {
        require(price > 0, "Invalid price");
        require(treasury != address(0), "Treasury not set");

        uint256 tokenId = nextTokenId;

        // まだミント前でも defaultRoyalty が有効なので tokenId を使って royaltyInfo を参照可
        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(tokenId, price);
        uint256 sellerAmount = price - royaltyAmount;

        if (royaltyAmount > 0) {
            pgirlsToken.safeTransferFrom(msg.sender, royaltyReceiver, royaltyAmount);
        }
        pgirlsToken.safeTransferFrom(msg.sender, treasury, sellerAmount);

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        nextTokenId += 1;
    }

    /* -----------------------------
       管理系
    ------------------------------*/
    function updateTokenURI(uint256 tokenId, string memory newURI) external onlyOwner {
        _setTokenURI(tokenId, newURI);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "zero address");
        treasury = newTreasury;
    }

    // OZ の multiple inheritance に合わせた supportsInterface
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
