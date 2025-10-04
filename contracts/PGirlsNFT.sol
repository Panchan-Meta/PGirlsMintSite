// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PGirlsNFT is ERC721URIStorage, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public pgirlsToken;
    address public treasury;
    uint256 public nextTokenId;

    constructor(
        address initialOwner,
        address _pgirlsToken,
        address _treasury
    ) ERC721("PGirls NFT", "PGN") Ownable(initialOwner) {
        pgirlsToken = IERC20(_pgirlsToken);
        treasury = _treasury;
        nextTokenId = 1;
    }

    function mint(uint256 price, string memory tokenURI) public {
        pgirlsToken.safeTransferFrom(msg.sender, treasury, price);

        uint256 tokenId = nextTokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        nextTokenId += 1;
    }

    function updateTokenURI(uint256 tokenId, string memory newURI) public onlyOwner {
        _setTokenURI(tokenId, newURI);
    }
}
