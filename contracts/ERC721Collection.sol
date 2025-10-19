// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/*
 * �R���N�V����1�{=1�R���g���N�g�B�e�A�C�e���� tokenId �ŊǗ��B
 * ����̎󂯎��̓t�����g�iERC20�j�ōs���A�{�R���g���N�g�̓~���g��URI�ݒ�̂݁B
 * �� ERC721URIStorage ���g�킸�A���O�� tokenURI ��ێ����V���v����
 */
contract ERC721Collection is ERC721, Ownable {
    // ��d�~���g�h�~
    mapping(uint256 => bool) public minted;

    // tokenURI �X�g���[�W
    mapping(uint256 => string) private _tokenURIs;

    constructor(address initialOwner, string memory name_, string memory symbol_)
        ERC721(name_, symbol_) 
        Ownable(initialOwner)
    {}

    /// @notice �w�� tokenId �� 1 �񂾂��~���g���AURI ��ݒ肷��
    /// @dev price �͌݊��p�̃_�~�[�����i�x�����̓t�����g�Ŏ��{�j
    function mint(uint256 tokenId, uint256 /*price*/, string calldata uri) external {
        require(!minted[tokenId], "Already minted");
        minted[tokenId] = true;

        _safeMint(msg.sender, tokenId);
        if (bytes(uri).length != 0) {
            _setTokenURI(tokenId, uri);
        }
    }

    /* ---------- tokenURI �֘A�i���O�����j ---------- */

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
