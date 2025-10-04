# PGirls Mint Site

This repository contains the PGirls mint site and the helper scripts that prepare CREATE2 deployments for the NFT collections. It is built with Next.js on the front-end and uses a Hardhat project for compiling and testing the contracts.

## Project structure

- `app/` – Next.js application code.
- `contracts/` – Solidity sources compiled by Hardhat.
- `scripts/` – Utility scripts, including the metadata/deployment script that generates the `deploy_*.sh` helpers.
- `metadata/` – Generated metadata and address lists for each collection.

## Installing dependencies

```bash
npm install
```

## Environment variables

Deployment helpers expect the following variables to be available (for example in `.env` or exported in the shell):

- `CREATE2_DEPLOYER` / `NEXT_PUBLIC_FACTORY` – address of the CREATE2 factory contract.
- `NEXT_PUBLIC_NFT_OWNER` / `TREASURY_ADDRESS` – default owner/treasury that will receive mint proceeds.
- `PGIRLS_ERC20_ADDRESS` / `NEXT_PUBLIC_PGIRLS_ERC20_ADDRESS` – ERC20 token used for minting payments.
- `RPC_URL` – JSON-RPC endpoint for the PGirls chain.
- `PRIVATE_KEY` – the account that signs deployment transactions.

The scripts also read several optional variables such as `NEXT_PUBLIC_PGIRLS`, `NEXT_PUBLIC_TREASURY`, `IMAGE_EXT`, etc. Refer to `scripts/generateMetadata.cjs` for the exhaustive list.

## Generating metadata & deployment scripts

1. Place collection assets under `public/assets/<CollectionName>/`.
2. Run the helper:

   ```bash
   node scripts/generateMetadata.cjs
   ```

   This produces metadata JSON files under `metadata/` and shell scripts like `scripts/metadata/deploy_<CollectionName>.sh` for CREATE2 deployment.

## Funding the deployment account

The generated `deploy_*.sh` scripts call

```bash
cast send $CREATE2_DEPLOYER 'deploy(bytes32,bytes)' ... --private-key $PRIVATE_KEY
```

The transaction is sent **from the account derived from `PRIVATE_KEY`**. Gas for the deployment is paid from this externally owned account, not from the factory nor the predicted collection address.

If you encounter `Failed to estimate gas: execution reverted`, make sure that the EOA corresponding to `PRIVATE_KEY` owns sufficient native PGirls to cover gas costs. You can display the address that needs to be funded with:

```bash
cast wallet address --private-key $PRIVATE_KEY
```

Transfer native PGirls to that address, then rerun the deployment script.

## Running the development server

```bash
npm run dev
```

This starts the Next.js dev server on <http://localhost:3000>.
