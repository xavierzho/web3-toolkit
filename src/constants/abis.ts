export const BATCH_TRANSFER_ABI = [
  {
    name: 'disperseEther',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ type: 'address[]', name: 'recipients' }, { type: 'uint256[]', name: 'values' }],
    outputs: []
  },
  {
    name: 'disperseToken',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address', name: 'token' }, { type: 'address[]', name: 'recipients' }, { type: 'uint256[]', name: 'values' }],
    outputs: []
  }
] as const;

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  }
] as const;

// 请将此地址替换为你自己在各条链上部署的 BatchTransfer 合约地址
// 如果没有部署，请先在 Remix 上部署前面的 Solidity 代码
export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0x...", // Mainnet
  56: "0x...", // BSC
  137: "0x...", // Polygon
  97: "0x...", // BSC 测试网
  // 这是一个常用的开源 Disperse 合约地址，仅作测试参考，建议自己部署
  11155111: "0xD152f549545093347A162Dce210e7293f1452150" // Sepolia 测试网
};
