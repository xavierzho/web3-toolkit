<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  parseEther,
  parseUnits,
} from 'viem'
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts'
import { bsc } from 'viem/chains'

type TradeMode = 'buy' | 'sell'
type BuyMode = 'exactSpend' | 'exactOut' | 'spendAll'
type AddressState = {
  address: string
  bnb?: string
  token?: string
  loading?: boolean
  lastError?: string | null
  updatedAt?: number
}
type TaskAccount = { pk: string; address: `0x${string}` }

const defaultForm = () => ({
  readRpc: 'https://bsc-dataseed.binance.org/',
  writeRpc: 'https://bsc-dataseed.binance.org/',
  router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  wbnb: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  token: '',
  tokenDecimals: 18,
  slippage: 0.015,
  gasPriceGwei: '',
  gasLimit: 300000,
  concurrency: 3,
  mode: 'buy' as TradeMode,
  buyMode: 'exactSpend' as BuyMode,
  mnemonic: '',
  accountStart: 0,
  accountCount: 0,
  amountInBnb: '',
  amountOutToken: '',
  sellAmountToken: '',
  sellAll: true,
  minLeftBnb: '0.002',
})

const form = reactive(defaultForm())
const privateKeysInput = ref('')
const running = ref(false)
const logs = ref<string[]>([])
const addressStates = ref<AddressState[]>([])
const publicClientRef = ref<ReturnType<typeof createPublicClient> | null>(null)
const fetchingBalances = ref(false)
let balanceTimer: number | null = null
let rebuildTimer: number | null = null
const stopRequested = ref(false)
const pendingQueue = ref<TaskAccount[]>([])
const completedCount = ref(0)
const resumable = computed(() => !running.value && pendingQueue.value.length > 0)
const executedKeys = ref(new Set<string>())

const pathWbnbToToken = computed(() => [form.wbnb, form.token])
const pathTokenToWbnb = computed(() => [form.token, form.wbnb])

onMounted(() => {
  window.addEventListener('beforeunload', handleUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleUnload)
  stopBalancePolling()
  clearRebuild()
})

function handleUnload() {
  stopBalancePolling()
}

function addLog(line: string) {
  const ts = new Date().toISOString().replace('T', ' ').replace('Z', '')
  logs.value.unshift(`[${ts}] ${line}`)
}

function resetForm() {
  Object.assign(form, defaultForm())
  privateKeysInput.value = ''
  addressStates.value = []
  pendingQueue.value = []
  completedCount.value = 0
}

function ensurePublicClient() {
  if (!publicClientRef.value) {
    publicClientRef.value = createPublicClient({ transport: http(form.readRpc), chain: bsc })
  }
  return publicClientRef.value
}

function parsePrivateKeys(): string[] {
  return privateKeysInput.value
    .split(/[\n,;]/)
    .map((k) => k.trim())
    .filter(Boolean)
}

async function getGasPrice(publicClient: ReturnType<typeof createPublicClient>): Promise<bigint> {
  if (form.gasPriceGwei) {
    const gwei = Number(form.gasPriceGwei)
    if (Number.isNaN(gwei) || gwei <= 0) throw new Error('Gas Price Gwei 非法')
    return BigInt(Math.floor(gwei * 1e9))
  }
  return publicClient.getGasPrice()
}

function applySlippage(amount: bigint, slip: number, direction: 'down' | 'up') {
  const pct = Math.max(slip, 0)
  const denom = 10_000_000
  if (direction === 'down') {
    const factor = BigInt(Math.floor((1 - pct) * denom))
    return (amount * factor) / BigInt(denom)
  }
  const factor = BigInt(Math.floor((1 + pct) * denom))
  return (amount * factor) / BigInt(denom)
}

const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'amountIn' },
      { type: 'address[]', name: 'path' },
    ],
    outputs: [{ type: 'uint256[]', name: 'amounts' }],
  },
  {
    name: 'getAmountsIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'amountOut' },
      { type: 'address[]', name: 'path' },
    ],
    outputs: [{ type: 'uint256[]', name: 'amounts' }],
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapETHForExactTokens',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

function ensureTokenDecimals(): number {
  const n = Number(form.tokenDecimals)
  if (!Number.isFinite(n) || n <= 0 || n > 36) throw new Error('Token decimals 非法')
  return n
}

async function computeSpendAllAmount(
  publicClient: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  gasPrice: bigint,
) {
  const minLeft = form.minLeftBnb ? parseEther(String(form.minLeftBnb)) : 0n
  const balance = await publicClient.getBalance({ address, blockTag: 'pending' })
  const reserve = (gasPrice * BigInt(form.gasLimit) * 12n) / 10n
  const available = balance - reserve - minLeft
  if (available <= 0n) {
    throw new Error(
      `余额不足，balance=${formatEther(balance)} BNB，预留gas=${formatEther(reserve)}，保留=${formatEther(minLeft)}`,
    )
  }
  return available
}

async function ensureAllowance(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  owner: `0x${string}`,
  spender: `0x${string}`,
  required: bigint,
) {
  const allowance = (await publicClient.readContract({
    address: form.token as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })) as bigint
  if (allowance >= required) return
  const hash = await walletClient.writeContract({
    account: owner,
    address: form.token as `0x${string}`,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, required],
    chain: bsc,
  })
  addLog(`${owner} 批准中，tx=${hash}`)
  await publicClient.waitForTransactionReceipt({ hash })
}

async function handleBuy(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  account: `0x${string}`,
) {
  const gasPrice = await getGasPrice(publicClient)
  const slippage = Math.max(Number(form.slippage || 0), 0)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 900)

  if (form.buyMode === 'exactSpend') {
    const amountIn = parseEther(String(form.amountInBnb || ''))
    const [, quoteOut] = (await publicClient.readContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, pathWbnbToToken.value],
    })) as bigint[]
    const minOut = applySlippage(quoteOut as bigint, slippage, 'down')
    const hash = await walletClient.writeContract({
      account,
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
      args: [minOut, pathWbnbToToken.value, account, deadline],
      value: amountIn,
      gas: BigInt(form.gasLimit),
      gasPrice,
      chain: bsc,
    })
    addLog(`${account} 买入提交，value=${formatEther(amountIn)} BNB, tx=${hash}`)
    await publicClient.waitForTransactionReceipt({ hash })
  } else if (form.buyMode === 'exactOut') {
    const decimals = ensureTokenDecimals()
    const outWant = parseUnits(String(form.amountOutToken || ''), decimals)
    const [quoteIn] = (await publicClient.readContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getAmountsIn',
      args: [outWant, pathWbnbToToken.value],
    })) as bigint[]
    const maxIn = applySlippage(quoteIn as bigint, slippage, 'up')
    const hash = await walletClient.writeContract({
      account,
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'swapETHForExactTokens',
      args: [outWant, pathWbnbToToken.value, account, deadline],
      value: maxIn,
      gas: BigInt(form.gasLimit),
      gasPrice,
      chain: bsc,
    })
    addLog(`${account} 买入 exactOut 提交，maxIn=${formatEther(maxIn)} BNB, tx=${hash}`)
    await publicClient.waitForTransactionReceipt({ hash })
  } else if (form.buyMode === 'spendAll') {
    const amountIn = await computeSpendAllAmount(publicClient, account.address as `0x${string}`, gasPrice)
    const [, quoteOut] = (await publicClient.readContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, pathWbnbToToken.value],
    })) as bigint[]
    const minOut = applySlippage(quoteOut as bigint, slippage, 'down')
    const hash = await walletClient.writeContract({
      account,
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
      args: [minOut, pathWbnbToToken.value, account, deadline],
      value: amountIn,
      gas: BigInt(form.gasLimit),
      gasPrice,
      chain: bsc,
    })
    addLog(`${account} 买入提交(用尽余额)，value=${formatEther(amountIn)} BNB, tx=${hash}`)
    await publicClient.waitForTransactionReceipt({ hash })
  }
}

async function handleSell(
  publicClient: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  account: `0x${string}`,
) {
  const decimals = ensureTokenDecimals()
  const balance = (await publicClient.readContract({
    address: form.token as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  })) as bigint
  if (balance === 0n) {
    addLog(`${account} token 余额为 0，跳过`)
    return
  }
  const amountToSell = form.sellAll ? balance : parseUnits(String(form.sellAmountToken || balance.toString()), decimals)

  const gasPrice = await getGasPrice(publicClient)
  const slippage = Math.max(Number(form.slippage || 0), 0)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 900)

  const [, quoteOut] = (await publicClient.readContract({
    address: form.router as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountToSell, pathTokenToWbnb.value],
  })) as bigint[]
  const minOut = applySlippage(quoteOut as bigint, slippage, 'down')

  await ensureAllowance(publicClient, walletClient, account, form.router as `0x${string}`, amountToSell)

  const hash = await walletClient.writeContract({
    account,
    address: form.router as `0x${string}`,
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    args: [amountToSell, minOut, pathTokenToWbnb.value, account, deadline],
    gas: BigInt(form.gasLimit),
    gasPrice,
    chain: bsc,
  })
  addLog(`${account} 卖出提交，amount=${amountToSell.toString()} (token raw), tx=${hash}`)
  await publicClient.waitForTransactionReceipt({ hash })
}

async function runWithConcurrency(
  items: TaskAccount[],
  limit: number,
  worker: (item: TaskAccount, idx: number) => Promise<void>,
) {
  const queue = [...items]
  let active = 0
  return new Promise<TaskAccount[]>((resolve) => {
    const step = () => {
      if (stopRequested.value) {
        resolve([...queue])
        return
      }
      if (!queue.length && active === 0) {
        resolve([])
        return
      }
      while (active < limit && queue.length && !stopRequested.value) {
        const idx = items.length - queue.length
        const item = queue.shift() as TaskAccount
        active++
        worker(item, idx)
          .catch((err) => addLog(`第 ${idx + 1} 个任务出错：${err instanceof Error ? err.message : String(err)}`))
          .finally(() => {
            active--
            step()
          })
      }
    }
    step()
  })
}

async function onRun() {
  try {
    stopRequested.value = false
    const accountsRaw = pendingQueue.value.length ? pendingQueue.value : buildAccounts()
    const accounts = accountsRaw.filter((a) => !executedKeys.value.has(buildTxKey(a.address)))
    if (!form.token) throw new Error('请填写 token 地址')
    if (!accounts.length) throw new Error('没有可执行的钱包')
    if (!pendingQueue.value.length) {
      completedCount.value = 0
    }
    pendingQueue.value = [...accounts]
    running.value = true
    logs.value = []

    const publicClient = ensurePublicClient()
    syncAddressStates(accounts.map((a) => a.address))
    startBalancePolling()
    await refreshBalances(publicClient)

    const remaining = await runWithConcurrency(accounts, form.concurrency, async ({ pk, address }, idx) => {
      const account = privateKeyToAccount(pk as `0x${string}`)
      const walletClient = createWalletClient({
        account,
        chain: bsc,
        transport: http(form.writeRpc),
      })
      addLog(`开始处理 #${idx + 1}: ${address}`)
      if (form.mode === 'buy') {
        await handleBuy(publicClient, walletClient, account.address)
      } else {
        await handleSell(publicClient, walletClient, account.address)
      }
      addLog(`完成 #${idx + 1}: ${address}`)
      completedCount.value += 1
      executedKeys.value.add(buildTxKey(address))
      await refreshBalances(publicClient)
    })
    pendingQueue.value = remaining
    if (stopRequested.value) {
      addLog(`已停止，剩余 ${remaining.length} 个待处理`)
    } else {
      addLog('执行完成')
    }
  } catch (e) {
    addLog(e instanceof Error ? e.message : String(e))
  } finally {
    running.value = false
    stopBalancePolling()
    stopRequested.value = false
  }
}

function onStop() {
  if (!running.value) return
  stopRequested.value = true
}

function buildAccounts(allowEmpty = false) {
  const result: TaskAccount[] = []
  if (form.mnemonic.trim() && form.accountCount > 0) {
    const start = Number(form.accountStart) || 0
    const count = Number(form.accountCount) || 0
    for (let i = 0; i < count; i++) {
      const idx = start + i
      const acc = mnemonicToAccount(form.mnemonic.trim(), { path: `m/44'/60'/0'/0/${idx}` })
      const pk = bytesToHex(acc.getHdKey().privateKey)
      result.push({ pk, address: acc.address as `0x${string}` })
    }
  }
  const keys = parsePrivateKeys()
  keys.forEach((k) => {
    const acc = privateKeyToAccount(k as `0x${string}`)
    result.push({ pk: k, address: acc.address as `0x${string}` })
  })
  // 去重（防重复输入同地址）
  const seen = new Set<string>()
  const deduped = result.filter((r) => {
    const key = r.address.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!result.length && !allowEmpty) throw new Error('请提供助记词+数量，或粘贴至少 1 个私钥')
  if (deduped.length > 2000) throw new Error('账户数量过多，请分批执行')
  return deduped
}

function clearRebuild() {
  if (rebuildTimer != null) {
    clearTimeout(rebuildTimer)
    rebuildTimer = null
  }
}

watch(
  () => [form.mnemonic, form.accountStart, form.accountCount, privateKeysInput.value, form.token, form.readRpc, form.writeRpc],
  () => {
    clearRebuild()
    rebuildTimer = window.setTimeout(() => {
      try {
        const accounts = buildAccounts(true)
        syncAddressStates(accounts.map((a) => a.address))
        publicClientRef.value = null
        refreshBalances().catch(() => {})
      } catch {
        addressStates.value = []
        stopBalancePolling()
      }
      rebuildTimer = null
    }, 500)
  },
)

function syncAddressStates(addresses: string[]) {
  const map = new Map(addressStates.value.map((row) => [row.address.toLowerCase(), row]))
  addressStates.value = addresses.map((addr) => {
    const old = map.get(addr.toLowerCase())
    return (
      old || {
        address: addr,
        bnb: undefined,
        token: undefined,
        loading: false,
        lastError: null,
        updatedAt: undefined,
      }
    )
  })
}

async function refreshBalances(publicClient?: ReturnType<typeof createPublicClient>) {
  if (!addressStates.value.length || fetchingBalances.value) return
  fetchingBalances.value = true
  const client = publicClient || ensurePublicClient()
  const decimals = ensureTokenDecimals()
  const tokenAddr = form.token
  const now = Date.now()
  addressStates.value.forEach((row) => {
    row.loading = true
    row.lastError = null
  })
  try {
    const bnbBalances = await Promise.all(
      addressStates.value.map((row) =>
        client.getBalance({ address: row.address as `0x${string}`, blockTag: 'pending' }).catch((e) => e),
      ),
    )
    let tokenBalances: (bigint | Error)[] = []
    if (tokenAddr) {
      const res = await client.multicall({
        contracts: addressStates.value.map((row) => ({
          address: tokenAddr as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [row.address as `0x${string}`],
          allowFailure: true,
        })),
        allowFailure: true,
      })
      tokenBalances = res.map((r) => (r.status === 'success' ? (r.result as bigint) : new Error('balanceOf failed')))
    } else {
      tokenBalances = addressStates.value.map(() => 0n)
    }
  addressStates.value.forEach((row, idx) => {
    const bnbRes = bnbBalances[idx]
    const tokenRes = tokenBalances[idx]
    if (bnbRes instanceof Error) {
      row.lastError = bnbRes.message
      } else {
        row.bnb = formatEther(bnbRes as bigint)
      }
      if (tokenRes instanceof Error) {
        row.lastError = [row.lastError, tokenRes.message].filter(Boolean).join(' | ') || tokenRes.message
      } else if (tokenAddr) {
        row.token = formatUnits(tokenRes as bigint, decimals)
      } else {
        row.token = undefined
      }
      row.updatedAt = now
      row.loading = false
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    addressStates.value.forEach((row) => {
      row.lastError = msg
      row.loading = false
    })
  } finally {
    fetchingBalances.value = false
  }
}

function startBalancePolling() {
  stopBalancePolling()
  balanceTimer = window.setInterval(() => {
    refreshBalances().catch(() => {})
  }, 8000)
}

function stopBalancePolling() {
  if (balanceTimer != null) {
    clearInterval(balanceTimer)
    balanceTimer = null
  }
}

function buildTxKey(address: string) {
  return `${address.toLowerCase()}-${form.mode}-${form.buyMode}-${form.token}`
}
</script>

<template>
  <div class="page">
    <header>
      <div>
        <h1>批量买卖 (前端临时版)</h1>
        <p>内存执行，刷新/关闭即清空；谨慎粘贴助记词/私钥。</p>
      </div>
      <div class="actions">
        <button type="button" @click="resetForm" :disabled="running">重置</button>
        <button type="button" @click="logs = []">清空日志</button>
      </div>
    </header>

    <section class="card">
      <div class="row">
        <label>读 RPC (queries)</label>
        <input v-model="form.readRpc" placeholder="https://bsc-dataseed.binance.org/" />
      </div>
      <div class="row">
        <label>写 RPC (send tx)</label>
        <input v-model="form.writeRpc" placeholder="https://bsc-dataseed.binance.org/" />
      </div>
      <div class="row">
        <label>Router</label>
        <input v-model="form.router" />
      </div>
      <div class="row">
        <label>WBNB</label>
        <input v-model="form.wbnb" />
      </div>
      <div class="row">
        <label>Token</label>
        <input v-model="form.token" placeholder="代币地址" />
      </div>
      <div class="row">
        <label>Token Decimals</label>
        <input v-model.number="form.tokenDecimals" type="number" min="1" max="36" />
      </div>
      <div class="row">
        <label>模式</label>
        <div class="chips">
          <button :class="{ active: form.mode === 'buy' }" @click="form.mode = 'buy'">买</button>
          <button :class="{ active: form.mode === 'sell' }" @click="form.mode = 'sell'">卖</button>
        </div>
      </div>

      <div v-if="form.mode === 'buy'" class="subcard">
        <div class="row">
          <label>买入方式</label>
          <div class="chips">
            <button :class="{ active: form.buyMode === 'exactSpend' }" @click="form.buyMode = 'exactSpend'">
              按 BNB 金额买
            </button>
            <button :class="{ active: form.buyMode === 'exactOut' }" @click="form.buyMode = 'exactOut'">
              按期望 Token 量
            </button>
            <button :class="{ active: form.buyMode === 'spendAll' }" @click="form.buyMode = 'spendAll'">
              自适应全部 BNB
            </button>
          </div>
        </div>
        <div class="row" v-if="form.buyMode === 'exactSpend'">
          <label>BNB 金额</label>
          <input v-model="form.amountInBnb" placeholder="例如 0.1" />
        </div>
        <div class="row" v-else-if="form.buyMode === 'exactOut'">
          <label>Token 数量</label>
          <input v-model="form.amountOutToken" placeholder="例如 100000" />
        </div>
        <div class="row" v-else>
          <label>保留 BNB (下单后至少剩余)</label>
          <input v-model="form.minLeftBnb" placeholder="例如 0.002" />
        </div>
      </div>

      <div v-else class="subcard">
        <div class="row">
          <label>卖出量</label>
          <div class="chips">
            <button :class="{ active: form.sellAll }" @click="form.sellAll = true">全部余额</button>
            <button :class="{ active: !form.sellAll }" @click="form.sellAll = false">自定义</button>
          </div>
        </div>
        <div class="row" v-if="!form.sellAll">
          <label>Token 数量</label>
          <input v-model="form.sellAmountToken" placeholder="按 token 精度填写" />
        </div>
      </div>

      <div class="grid">
        <label>
          滑点 (小数)
          <input v-model.number="form.slippage" type="number" step="0.001" />
        </label>
        <label>
          Gas Price (Gwei)
          <input v-model="form.gasPriceGwei" type="number" step="0.1" />
        </label>
        <label>
          Gas Limit
          <input v-model.number="form.gasLimit" type="number" min="21000" />
        </label>
        <label>
          并发
          <input v-model.number="form.concurrency" type="number" min="1" max="20" />
        </label>
      </div>
    </section>

    <section class="card">
      <div class="row">
        <label>助记词（可选）</label>
        <textarea v-model="form.mnemonic" placeholder="12/24 助记词；仅保存在内存" rows="2" />
      </div>
      <div class="grid">
        <label>
          Account Start
          <input v-model.number="form.accountStart" type="number" min="0" />
        </label>
        <label>
          Account Count
          <input v-model.number="form.accountCount" type="number" min="0" />
        </label>
      </div>
      <div class="row">
        <label>私钥列表（可选）</label>
        <textarea v-model="privateKeysInput" placeholder="一行一个或逗号分隔；仅存于内存" rows="4" />
      </div>
      <div class="row">
        <label>地址预览 ({{ addressStates.length }})</label>
        <div class="preview">
          <div v-if="!addressStates.length" class="muted">暂无地址</div>
          <table v-else class="addr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>地址</th>
                <th>BNB</th>
                <th>Token</th>
                <th>更新时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in addressStates" :key="row.address">
                <td>{{ idx + 1 }}</td>
                <td class="addr">{{ row.address }}</td>
                <td>{{ row.bnb ?? '-' }}</td>
                <td>{{ row.token ?? '-' }}</td>
                <td>
                  <span class="mini" v-if="row.loading">刷新中...</span>
                  <span class="mini" v-else-if="row.updatedAt">{{ new Date(row.updatedAt).toLocaleTimeString() }}</span>
                  <span class="mini" v-else>--</span>
                </td>
                <td>
                  <span class="mini error" v-if="row.lastError">错误: {{ row.lastError }}</span>
                  <span class="mini" v-else>-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="row btn-row">
        <button class="primary" :disabled="running" @click="onRun">
          {{ running ? '执行中...' : resumable ? '恢复执行' : '开始执行' }}
        </button>
        <button type="button" :disabled="!running" @click="onStop">停止</button>
        <span class="mini">已完成: {{ completedCount }} | 待处理: {{ pendingQueue.length }}</span>
      </div>
    </section>

    <section class="card logs">
      <div class="logs-header">
        <h3>日志</h3>
        <span>{{ logs.length }} 条</span>
      </div>
      <div class="log-body">
        <div v-if="!logs.length" class="muted">暂无日志</div>
        <div v-else v-for="(line, idx) in logs" :key="idx" class="log-line">
          {{ line }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
  color: #111;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

h1 {
  margin: 0;
  font-size: 22px;
}

p {
  margin: 4px 0 0;
  color: #555;
  line-height: 1.4;
}

.actions {
  display: flex;
  gap: 8px;
}

.card {
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
}

.subcard {
  border: 1px dashed #ccc;
  padding: 12px;
  border-radius: 8px;
  margin: 8px 0 12px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.btn-row {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
}

label {
  font-weight: 600;
  color: #333;
}

input,
textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  font-size: 14px;
}

textarea {
  resize: vertical;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

button {
  border: 1px solid #d0d7de;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
}

button.primary {
  background: #0b73ec;
  color: #fff;
  border-color: #0b73ec;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chips button {
  background: #f0f4ff;
}

.chips button.active {
  background: #0b73ec;
  color: #fff;
  border-color: #0b73ec;
}

.logs {
  max-height: 360px;
  display: flex;
  flex-direction: column;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.log-body {
  overflow: auto;
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  flex: 1;
}

.log-line {
  padding: 3px 0;
}

.muted {
  color: #777;
  padding: 8px 0;
}

.preview {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  max-height: 280px;
  overflow: auto;
  background: #fafafa;
}

.addr {
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 13px;
  padding: 2px 0;
  word-break: break-all;
}

.mini {
  color: #666;
  font-size: 12px;
}

.error {
  color: #b3261e;
}

.addr-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.addr-table th,
.addr-table td {
  border: 1px solid #e5e5e5;
  padding: 6px 8px;
  text-align: left;
}

.addr-table th {
  background: #f0f4ff;
}

.addr-table tbody tr:nth-child(odd) {
  background: #fff;
}

.addr-table tbody tr:nth-child(even) {
  background: #f9f9f9;
}

@media (max-width: 640px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}
</style>
