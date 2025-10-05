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
    address public treasury;
    uint256 public nextTokenId;

    address private constant CREATOR_ADDRESS =
        0xfF280ED2B0FF2Fb64E97137F82307042B4338C79;
    uint96 private constant ROYALTY_BPS = 500; // 5%

    constructor(
        address initialOwner,
        address _pgirlsToken,
        address _treasury
    ) ERC721("PGirls NFT", "PGN") Ownable(initialOwner) {
        pgirlsToken = IERC20(_pgirlsToken);
        treasury = _treasury;
        nextTokenId = 1;

        _setDefaultRoyalty(CREATOR_ADDRESS, ROYALTY_BPS);
    }

    function mint(uint256 price, string memory tokenURI) public {
        _purchase(price, tokenURI);
    }

    function buy(uint256 price, string memory tokenURI) external {
        _purchase(price, tokenURI);
    }

    function _purchase(uint256 price, string memory tokenURI) internal {
        pgirlsToken.safeTransferFrom(msg.sender, treasury, price);

        uint256 tokenId = nextTokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        nextTokenId += 1;
    }

    function updateTokenURI(uint256 tokenId, string memory newURI) public onlyOwner {
        _setTokenURI(tokenId, newURI);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
