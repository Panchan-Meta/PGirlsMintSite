const { expect } = require("chai");
const { ethers } = require("hardhat");

const parseUnits = (value) => ethers.parseUnits(value, 18);

describe("PGirlsNFT secondary sale", function () {
  it("distributes proceeds between seller and owner", async function () {
    const [collectionOwner, treasury, seller, buyer] = await ethers.getSigners();

    const ERC20Preset = await ethers.getContractFactory("ERC20PresetMinterPauser");
    const pgirlsToken = await ERC20Preset.deploy("PGirls Token", "PGT");

    await pgirlsToken.mint(seller.address, parseUnits("1000"));
    await pgirlsToken.mint(buyer.address, parseUnits("1000"));

    const PGirlsNFT = await ethers.getContractFactory("PGirlsNFT");
    const nft = await PGirlsNFT.deploy(
      collectionOwner.address,
      pgirlsToken.target,
      treasury.address
    );

    const primaryPrice = parseUnits("100");
    await pgirlsToken.connect(seller).approve(nft.target, primaryPrice);
    await nft.connect(seller).buy(primaryPrice, "ipfs://token-1");

    const tokenId = 1n;
    expect(await nft.ownerOf(tokenId)).to.equal(seller.address);

    const secondaryPrice = parseUnits("200");
    await pgirlsToken.connect(buyer).approve(nft.target, secondaryPrice);

    const sellerBalanceBefore = await pgirlsToken.balanceOf(seller.address);
    const ownerBalanceBefore = await pgirlsToken.balanceOf(collectionOwner.address);

    await nft.connect(buyer).buySecondary(tokenId, secondaryPrice);

    expect(await nft.ownerOf(tokenId)).to.equal(buyer.address);

    const royaltyShare = (secondaryPrice * 500n) / 10000n;
    const sellerShare = secondaryPrice - royaltyShare;

    expect(await pgirlsToken.balanceOf(seller.address)).to.equal(
      sellerBalanceBefore + sellerShare
    );
    expect(await pgirlsToken.balanceOf(collectionOwner.address)).to.equal(
      ownerBalanceBefore + royaltyShare
    );
  });
});
