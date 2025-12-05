import { mainnet, bsc, sepolia, bscTestnet } from 'viem/chains';

// Common Router Addresses
export const ROUTERS: Record<'V2' | 'V3', Record<number, string>> = {
    V2: {
        [mainnet.id]: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2
        [bsc.id]: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2
        [sepolia.id]: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008', // Uniswap V2 (Sepolia)
    },
    V3: {
        [mainnet.id]: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router
        [bsc.id]: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', // PancakeSwap V3 SmartRouter (official, verified on BSCScan)
        [sepolia.id]: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 Router (Sepolia)
        [bscTestnet.id]: '0x1b81D678ffb9C0263b24A97847620C99d213eB14', // PancakeSwap V3 SmartRouter (Testnet)
    }
}

// V3 Factory addresses for pool lookup
export const V3_FACTORIES: Record<number, string> = {
    [mainnet.id]: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory
    [bsc.id]: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', // PancakeSwap V3 Factory
    [sepolia.id]: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c', // Uniswap V3 Factory (Sepolia)
    [bscTestnet.id]: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865', // PancakeSwap V3 Factory (Testnet)
}

// Map of common base tokens (WETH, Stablecoins) for different chains
interface TokenInfo {
    address: string;
    decimals: number;
    isNative: boolean; // Indicates if it's the chain's native wrapped token (WETH/WBNB)
}

// 基础交易代币信息：WETH（可兼容Native/ETH）, USDC, USDT
export const BASE_TOKENS: Record<number, Record<'WETH' | 'USDC' | 'USDT', TokenInfo>> = {
    [mainnet.id]: {
        WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, isNative: true },
        USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, isNative: false },
        USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, isNative: false },
    },
    [bsc.id]: {
        WETH: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, isNative: true }, // WBNB
        USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, isNative: false }, // BEP20 USDC typically has 18 decimals
        USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, isNative: false }, // BEP20 USDT typically has 18 decimals
    },
    [sepolia.id]: {
        WETH: { address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', decimals: 18, isNative: true }, // Sepolia WETH
        USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902fB6DbcE8', decimals: 6, isNative: false }, // Common Sepolia USDC
        USDT: { address: '0x7770C36B6900f07F37E5a1f6aA75E590132E9D47', decimals: 6, isNative: false }, // Mock Sepolia USDT (Placeholder)
    },
    [bscTestnet.id]: {
        WETH: { address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', decimals: 18, isNative: true },
        USDC: { address: '0x64544969ed7EBf5f083679233325356EbE738930', decimals: 18, isNative: false },
        USDT: { address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18, isNative: false },
    }
};


// Minimal ABIs
export const V2_ROUTER_ABI = [
    {
        inputs: [{ name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
        name: 'swapExactETHForTokens',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'payable',
        type: 'function'
    },
    {
        inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
        name: 'swapExactTokensForETH',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    // 新增：支持ERC20代币对代币的交易
    {
        inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }],
        name: 'swapExactTokensForTokens',
        outputs: [{ name: 'amounts', type: 'uint256[]' }],
        stateMutability: 'nonpayable',
        type: 'function'
    }
] as const;


export const V3_ROUTER_ABI = [
    {
        inputs: [{
            components: [
                { name: 'tokenIn', type: 'address' },
                { name: 'tokenOut', type: 'address' },
                { name: 'fee', type: 'uint24' },
                { name: 'recipient', type: 'address' },
                { name: 'amountIn', type: 'uint256' },
                { name: 'amountOutMinimum', type: 'uint256' },
                { name: 'sqrtPriceLimitX96', type: 'uint160' }
            ],
            name: 'params',
            type: 'tuple'
        }],
        name: 'exactInputSingle',
        outputs: [{ name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function'
    }
] as const;

// V3 Factory ABI (for querying pool address)
export const V3_FACTORY_ABI = [
    {
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' }
        ],
        name: 'getPool',
        outputs: [{ name: 'pool', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    }
] as const;