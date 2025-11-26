import { useWalletStore } from '../store/walletStore';
import { useWriteContract, useDeployContract } from 'wagmi';
import { createWalletClient, http, publicActions } from 'viem';
import { mainnet, bsc, bscTestnet, polygon, sepolia, type Chain } from 'viem/chains';

// 简单的链映射，实际项目可更完善
const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  56: bsc,
  97: bscTestnet,
  137: polygon,
  11155111: sepolia
};

export function useUnifiedSender(chainId: number = 1, rpcUrl?: string) {
  const { mode, evmAccount } = useWalletStore();
  const { writeContractAsync: writeExternal } = useWriteContract();
  const { deployContractAsync: deployExternal } = useDeployContract();

  const sendTransaction = async (txParams: any) => {
    if (mode === 'EXTERNAL') {
      if (!writeExternal) throw new Error("未连接外部钱包");
      return await writeExternal({
        address: txParams.address,
        abi: txParams.abi,
        functionName: txParams.functionName,
        args: txParams.args,
        value: txParams.value,
      });
    } else {
      if (!evmAccount) throw new Error("未导入本地账户");
      const chain = CHAIN_MAP[chainId] || mainnet;
      const client = createWalletClient({
        account: evmAccount,
        chain,
        transport: http(rpcUrl) // 使用提供的 RPC URL
      }).extend(publicActions);

      try {
        // 先检查账户余额
        const balance = await client.getBalance({ address: evmAccount.address });
        if (balance === 0n) {
          throw new Error(`账户余额不足：${evmAccount.address} 在链 ${chainId} 上没有原生代币（ETH/BNB等）来支付 gas 费用`);
        }

        return await client.writeContract({
          address: txParams.address,
          abi: txParams.abi,
          functionName: txParams.functionName,
          args: txParams.args,
          value: txParams.value,
        });
      } catch (error: any) {
        if (error.message?.includes('gas required exceeds allowance')) {
          throw new Error(`Gas 费用不足：请确保账户 ${evmAccount.address} 有足够的原生代币（ETH/BNB等）来支付交易费用`);
        }
        throw error;
      }
    }
  };

  const deployContract = async (deployParams: any) => {
    if (mode === 'EXTERNAL') {
      if (!deployExternal) throw new Error("未连接外部钱包");
      return await deployExternal({
        abi: deployParams.abi,
        bytecode: deployParams.bytecode,
        args: deployParams.args,
        value: deployParams.value,
      });
    } else {
      if (!evmAccount) throw new Error("未导入本地账户");
      const chain = CHAIN_MAP[chainId] || mainnet;
      const client = createWalletClient({
        account: evmAccount,
        chain,
        transport: http(rpcUrl) // 使用提供的 RPC URL
      }).extend(publicActions);

      try {
        // 先检查账户余额
        const balance = await client.getBalance({ address: evmAccount.address });
        if (balance === 0n) {
          throw new Error(`账户余额不足：${evmAccount.address} 在链 ${chainId} 上没有原生代币（ETH/BNB等）来支付 gas 费用`);
        }

        return await client.deployContract({
          abi: deployParams.abi,
          bytecode: deployParams.bytecode,
          args: deployParams.args,
          value: deployParams.value,
        });
      } catch (error: any) {
        if (error.message?.includes('gas required exceeds allowance')) {
          throw new Error(`Gas 费用不足：请确保账户 ${evmAccount.address} 有足够的原生代币（ETH/BNB等）来支付交易费用`);
        }
        throw error;
      }
    }
  };

  return { sendTransaction, deployContract };
}
