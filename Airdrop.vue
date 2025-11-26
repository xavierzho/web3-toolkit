<template>
  <div class="container">
    <header class="header">
      <div class="title-wrap">
        <h1>BSC 空投地址工具</h1>
        <p class="sub">导入、校验、查询代币余额与导出空投名单（仅用于名单准备）</p>
      </div>

      <div class="actions">
        <label class="file-btn" title="选择 CSV / TXT 文件">
          选择文件
          <input type="file" @change="onFile" accept=".csv,.txt" />
        </label>

        <div class="small-actions">
          <button class="btn" @click="pasteFromClipboard" :disabled="loading">粘贴</button>
          <button class="btn ghost" @click="clearAll" :disabled="loading || !rawInput">清空</button>
        </div>
      </div>

      <div>
        <button class="btn" @click="connectWallet">Connect</button>
        <!-- 这是新加的部署按钮 -->
        <button class="btn primary" @click="deployAirdropContract" :disabled="loading">
          部署空投合约
        </button>
      </div>

    </header>

    <section class="card">
      <label class="label">原始输入（CSV 或换行，每行 address,amount 可选）</label>
      <textarea v-model="rawInput" rows="6" placeholder="每行一个地址，例如：0xabc..., 或 CSV：address,amount"></textarea>

      <div class="row">
        <label class="row-item"><input type="checkbox" v-model="hasHeader" /> 文件含表头</label>
        <label class="row-item"><input type="checkbox" v-model="autoCheckBalance" /> 自动查询余额</label>

        <div class="rpc">
          RPC:
          <input v-model="rpc" placeholder="https://bsc-dataseed.binance.org/" />
        </div>
      </div>

      <div class="controls">
        <button class="btn primary" @click="parseInput" :disabled="loading">解析并校验</button>
        <button
          class="btn"
          :disabled="addresses.length === 0 || loading || !tokenAddress"
          @click="fetchBalances"
        >
          {{ loading ? '查询中...' : '查询余额' }}
        </button>
        <button class="btn" :disabled="addresses.length === 0 || loading" @click="exportCsv">导出 CSV</button>

      </div>
    </section>

    <section v-if="addresses.length" class="card list">
      <div class="list-header">
        <div class="counts">
          共 <strong>{{ addresses.length }}</strong> 个 • 有效 <strong>{{ validCount }}</strong> • 无效 <strong>{{ invalidCount }}</strong> • 去重后 <strong>{{ uniqueCount }}</strong>
        </div>

        <div class="token">
          <div class="token-item">
            <label class="token-label">代币地址</label>
            <input v-model="tokenAddress" placeholder="0x...（必须填写后可查询 ERC-20 余额）" />
          </div>
          <div class="token-item">
            <label class="token-label">空投合约</label>
            <input v-model="airdropContract" placeholder="0x...（batch 空投合约地址）" />
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
          <tr>
            <th style="width:40px">#</th>
            <th>地址</th>
            <th style="width:120px">数量</th>
            <th style="width:80px">状态</th>
            <th style="width:140px">代币余额</th>
            <th style="width:70px">操作</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(row, i) in displayRows" :key="i" :class="{ invalid: !row.valid }">
            <td>{{ i + 1 }}</td>
            <td class="mono">{{ row.address }}</td>
            <td>
              <input v-model="row.amount" class="small-input" />
            </td>
            <td>
              <span v-if="row.valid" class="badge ok">有效</span>
              <span v-else class="badge bad">无效</span>
            </td>
            <td class="mono">{{ row.balanceText ?? '-' }}</td>
            <td class="actions-cell">
              <button class="row-remove" title="删除这一行" @click="removeRow(i)" aria-label="删除">
                <svg viewBox="0 0 24 24" class="row-remove__icon" aria-hidden="true">
                  <path d="M10 11v6m4-6v6M4 7h16m-1 0-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7m3 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div class="list-actions">
        <div class="left-actions">
          <button class="btn" @click="dedupeAddresses" :disabled="loading">去重</button>
          <button class="btn" @click="fillEqualAmounts" :disabled="loading || rows.length === 0">平均分配</button>
          <button class="btn" @click="confirmSendBatch" :disabled="loading || rows.filter(r => r.valid).length === 0">
            发起批量空投 (batch 合约)
          </button>
        </div>
        <div class="hint">提示：仅用于名单准备。实际空投请在后端或离线签名执行。</div>
      </div>
    </section>

    <div v-if="loading" class="overlay">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  createPublicClient,
  http,
  formatUnits,
  parseUnits,
  encodeFunctionData,
  custom, createWalletClient,
  encodeDeployData, type PublicClient, type WalletClient, parseEther
} from 'viem'
import { bsc, bscTestnet } from 'viem/chains'
import {ContractByteCode,ContractABI} from '@/utils/airdrop.ts'
// Minimal ERC20 ABI
const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'approve', "inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}], outputs: [] },
  {"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
]

// batchAirdrop ABI (示例)
const airdropAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address[]",
        "name": "tos",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      }
    ],
    "name": "batchAirdropFrom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "name": "_recipients",
        "type": "address[]"
      },
      {
        "name": "_values",
        "type": "uint256[]"
      },
      {
        "name": "_tokenAddress",
        "type": "address"
      }
    ],
    "name": "AirTransfer",
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

// UI state
const rawInput = ref('')
const hasHeader = ref(false)
const autoCheckBalance = ref(false)
const rpc = ref('https://bsc-testnet-dataseed.bnbchain.org')
const tokenAddress = ref('0x957AC971ac3063A8AB0029257CcfFD5CFFF97a8a') // 填入目标代币地址（例如用户要空投的代币）
const airdropContract = ref('') // 批量空投合约地址
const loading = ref(false)
const walletAddress = ref('' as '0x${string}')
// parsed rows
type Row = { address: string; amount?: string; valid: boolean; balance?: bigint | null; balanceText?: string | null }
const rows = ref<Row[]>([])

let walletClient: WalletClient = createWalletClient({
  transport: custom(window.ethereum),
  chain: bscTestnet,
})
const publicClient = createPublicClient({
  transport: http(rpc.value),
  chain: bscTestnet,
})
async function connectWallet() {
  const [account] = await window.ethereum!.request({ method: 'eth_requestAccounts' })
  walletAddress.value = account
  console.log('connected wallet', walletAddress.value)
  walletClient = createWalletClient({
    transport: custom(window.ethereum),
    chain: bsc,
    account: account,
  })
}
// helpers
const addrRegex = /^0x[a-fA-F0-9]{40}$/
function isValidAddress(a: string) { return addrRegex.test(String(a || '').trim()) }

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const reader = new FileReader()
  reader.onload = () => { rawInput.value = String(reader.result || '') }
  reader.readAsText(f)
}

async function pasteFromClipboard() {
  try {
    const t = await navigator.clipboard.readText()
    rawInput.value = rawInput.value ? rawInput.value + '\n' + t : t
    console.log('pasted:', t)
  } catch (e: unknown) {
    alert('读取剪贴板失败')
  }
}

function clearAll() { rawInput.value = ''; rows.value = []; tokenAddress.value = '' }

function parseInput() {
  const text = rawInput.value.trim()
  if (!text) return alert('请输入地址列表或上传 CSV')
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const start = hasHeader.value ? 1 : 0
  const parsed: Row[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    const parts = line.split(/[, \t]+/).map(p => p.trim()).filter(Boolean)
    const address = parts[0]!
    const amount = parts[1] ?? ''
    parsed.push({ address, amount, valid: isValidAddress(address), balance: null, balanceText: null })
  }
  rows.value = parsed

  // 如果开启自动查询并且有 token 地址就立即查询
  if (autoCheckBalance.value && tokenAddress.value) {
    fetchBalances()
  }
}

const addresses = computed(() => rows.value.map(r => r.address))
const validCount = computed(() => rows.value.filter(r => r.valid).length)
const invalidCount = computed(() => rows.value.filter(r => !r.valid).length)
const uniqueCount = computed(() => new Set(rows.value.map(r => r.address.toLowerCase())).size)
const displayRows = computed(() => rows.value)

// 去重并合并数量
function dedupeAddresses() {
  const map = new Map<string, Row>()
  for (const r of rows.value) {
    const key = r.address.toLowerCase()
    if (map.has(key)) {
      const exist = map.get(key)!
      const a1 = parseFloat(exist.amount || '0') || 0
      const a2 = parseFloat(r.amount || '0') || 0
      exist.amount = (a1 + a2).toString()
    } else {
      map.set(key, { ...r, address: key })
    }
  }
  rows.value = Array.from(map.values())
}

function fillEqualAmounts() {
  const n = rows.value.length
  if (n === 0) return
  const total = prompt('请输入总分配数量（将平均分配）')
  if (!total) return
  const per = (parseFloat(total) / n).toString()
  rows.value = rows.value.map(r => ({ ...r, amount: per }))
}

// 防止重复并发
async function fetchBalances() {
  if (!tokenAddress.value) { alert('请输入代币地址'); return }
  if (loading.value) return
  loading.value = true
  try {
    // get decimals
    let decimals = 18
    try {
      const d = await publicClient.readContract({ address: tokenAddress.value as `0x${string}`, abi: erc20Abi, functionName: 'decimals' })
      decimals = Number(d)
    } catch (e) {
      console.warn('读取 decimals 失败，使用 18')
    }

    // batch in chunks to avoid rate limit
    const chunkSize = 20
    for (let i = 0; i < rows.value.length; i += chunkSize) {
      const chunk = rows.value.slice(i, i + chunkSize)
      await Promise.all(chunk.map(async (r) => {
        if (!r.valid) { r.balance = null; r.balanceText = null; return }
        try {
          const bal = await publicClient.readContract({ address: tokenAddress.value as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [r.address as `0x${string}`] })
          r.balance = BigInt(bal as bigint)
          r.balanceText = formatUnits(r.balance, decimals)
        } catch (err) {
          console.error('readContract error', err)
          r.balance = null
          r.balanceText = 'ERR'
        }
      }))
    }
  } finally {
    loading.value = false
  }
}

// 自动触发逻辑：当 autoCheckBalance / tokenAddress / rows.length 变化时防抖触发 fetchBalances
let _autoFetchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [autoCheckBalance, tokenAddress, () => rows.value.length],
  ([auto, token, n]) => {
    if (!auto) return
    if (!token) return
    if (!n || n === 0) return
    if (_autoFetchTimer) clearTimeout(_autoFetchTimer)
    _autoFetchTimer = setTimeout(() => {
      if (loading.value) return
      fetchBalances()
    }, 300)
  }
)

// 导出 CSV
function exportCsv() {
  const header = 'address,amount\n'
  const lines = rows.value.map(r => `${r.address},${(r.amount || '').toString().replace(/,/g, '')}`)
  const csv = header + lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'airdrop_list.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** 等待交易上链（简单轮询） */
async function waitForReceipt(publicClient: PublicClient, txHash: string, confirmations = 1, timeoutMs = 600000) {
  const start = Date.now()
  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error('等待 tx 上链超时')
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` })
      if (receipt && typeof receipt !== 'undefined' && receipt.blockNumber) {
        // 若需要检查 confirmations，可读取最新区块高度并比较，但这里简单等待被包含
        return receipt
      }
    } catch (e) {
      // ignore
    }
    // sleep 3s
    await new Promise((res) => setTimeout(res, 3000))
  }
}

/** 主函数：使用 viem 构造 calldata，并通过 window.ethereum 发交易 */
// airdrop: 0xb1859699264ffaf14074e4bd17c2f9535ee264cb
// airdrop2: 0x20B92759577fb8E4d9696F1A1F3aFCFde2a5cE12
async function sendBatchViaContract(airdropContractAddress: string, tokenDecimals = 18, chunkSize = 200) {
  if (!window.ethereum) { alert('请先连接钱包（MetaMask / WalletConnect）'); return }
  const validRows = rows.value.filter(r => r.valid)
  if (validRows.length === 0) { alert('没有有效地址'); return }

  // 构造 arrays
  const toListAll: string[] = validRows.map(r => r.address)
  const amtListAll: bigint[] = validRows.map(r => {
    const raw = r.amount && r.amount.trim() !== '' ? r.amount : '0'
    return parseUnits(raw, tokenDecimals) // bigint
  })

  console.log('airdropContractAddress', airdropContractAddress,amtListAll.reduce((acc, r) => {return acc+r}, 0n))
  const publicClient = createPublicClient({ chain: bsc, transport: http(rpc.value) })

  const approve = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [airdropContractAddress, amtListAll.reduce((acc, r) => {return acc+r}, 0n)]
  })
  const approveTx = await walletClient.sendTransaction({
    account: walletAddress.value as `0x${string}`,
    data: approve,
    to: tokenAddress.value as `0x${string}`,
    chain: bscTestnet
  })
  await waitForReceipt(publicClient, approveTx)
  console.log('success transfer', approveTx)
  // chunk 发送
  for (let i = 0; i < toListAll.length; i += chunkSize) {
    const chunkTos = toListAll.slice(i, i + chunkSize)
    const chunkAmts = amtListAll.slice(i, i + chunkSize)
    // 使用 viem 的 encodeFunctionData
    const data = encodeFunctionData({
      abi: airdropAbi,
      functionName: 'AirTransfer',
      args: [chunkTos, chunkAmts,tokenAddress.value],
    })

    // 发送交易 via wallet
    let txHash: string
    try {
      txHash = await walletClient.sendTransaction({
        account: walletAddress.value as `0x${string}`,
        to: airdropContractAddress as `0x${string}`,
        data : data as `0x${string}`,
        chain: bscTestnet,
      })
      console.log('tx sent', txHash, 'chunk start', i, 'size', chunkTos.length)
    } catch (sendErr) {
      console.error('eth_sendTransaction failed', sendErr)
      alert(`发送交易失败（chunk 起始 ${i}）： ${String(sendErr)}`)
      // 继续下一个 chunk 或中断：这里选择中断
      return
    }

    // 等待交易上链
    try {
      await waitForReceipt(publicClient, txHash, 1, 10 * 60 * 1000) // 10 min timeout
      console.log('chunk mined', txHash)
    } catch (waitErr) {
      console.error('等待上链失败', waitErr)
      alert(`等待交易确认超时（tx ${txHash}）`)
      // 继续或中断？这里继续
    }
  }

  alert('所有 chunk 提交完成（请在区块浏览器查看 tx）')
}

// UI helper：在用户点击按钮之前做个二次确认，然后调用 sendBatchViaContract
async function confirmSendBatch() {
  const contract = airdropContract.value || prompt('请输入批量空投合约地址（batchAirdrop 合约）')
  if (!contract) return
  airdropContract.value = contract
  const decimalsStr = prompt('请输入代币小数（默认 18）', '18')
  const decimals = decimalsStr ? Number(decimalsStr) : 18
  const chunkStr = prompt('每个 tx 的最大地址数（建议 50-500，受合约/链限制）', '200')
  const chunk = chunkStr ? Number(chunkStr) : 200
  if (!confirm(`确认要向 ${rows.value.filter(r => r.valid).length} 个地址发起批量（合约 ${contract}）吗？`)) return
  await sendBatchViaContract(contract, decimals, chunk)
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}


/** 🍀 新增：部署空投合约 */
async function deployAirdropContract() {
  if (!window.ethereum)
    return alert("请先连接钱包 MetaMask / Rabby 等");

  loading.value = true;
  try {

    const [account] = await walletClient.requestAddresses();

    const deployData = encodeDeployData({
      abi: ContractABI,
      bytecode: ContractByteCode,
      args: [BigInt(1000)],
    })

    const txHash = await walletClient.sendTransaction({
      account: account as `0x${string}`,
      data: deployData,
      chain: bscTestnet,
    });

    alert(`交易已发送，等待上链：\n\nTX：${txHash}`);

    // 等待 receipt 获取合约地址
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    const deployed = receipt.contractAddress;
    if (!deployed) return alert("部署失败：未返回合约地址");

    alert(`✅ 空投合约已部署:\n${deployed}`);
    console.log("✅ Airdrop 合约地址:", deployed);

  } catch (err) {
    console.error("deploy error", err);
    alert("部署失败：" + String(err));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
:global(:root) {
  --bg: #0d1117;
  --surface: #111827;
  --surface-alt: #0b1220;
  --card: #131c2d;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --primary: #66b8ff;
  --primary-strong: #4aa8ff;
  --border: #1f2a3d;
  --shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

:global(body) {
  margin: 0;
  min-height: 100vh;
  background: radial-gradient(circle at 10% 20%, rgba(102, 184, 255, 0.08), transparent 25%),
    radial-gradient(circle at 90% 0, rgba(244, 114, 182, 0.1), transparent 30%),
    var(--bg);
}

:global(#app) {
  min-height: 100vh;
}

* {
  box-sizing: border-box;
  font-family: 'Inter', 'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.container {
  width: 100%;
  margin: 0;
  padding: 32px 26px 48px;
  color: var(--text);
  background: transparent;
}

.header {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 16px;
  align-items: end;
  padding: 18px 18px 6px;
  border-bottom: 1px solid var(--border);
}

.title-wrap h1 {
  font-size: 26px;
  margin: 0 0 4px;
  letter-spacing: 0.4px;
}

.title-wrap .sub {
  font-size: 14px;
  color: var(--muted);
  margin: 0;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.small-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.file-btn {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #111;
  font-weight: 700;
  padding: 10px 16px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  min-width: 110px;
  text-align: center;
  box-shadow: 0 12px 30px rgba(250, 204, 21, 0.4);
  border: none;
}
.file-btn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.btn {
  padding: 9px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: linear-gradient(145deg, var(--surface), var(--surface-alt));
  color: var(--text);
  cursor: pointer;
  min-width: 80px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transition: transform 0.1s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.btn:hover:not([disabled]) {
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
  border-color: #2b3650;
}
.btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-strong));
  color: #0b1220;
  font-weight: 700;
  border: none;
}
.btn.ghost {
  background: transparent;
  border-color: var(--border);
}

.card {
  background: linear-gradient(145deg, var(--surface), #0e1624);
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--border);
  margin: 18px 0;
  box-shadow: var(--shadow);
}

.label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 6px;
  letter-spacing: 0.2px;
}

textarea,
input {
  width: 100%;
  color: var(--text);
  background: #0d1423;
  border: 1px solid var(--border);
  padding: 11px 12px;
  border-radius: 10px;
  outline: none;
  caret-color: var(--primary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

textarea:focus,
input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(102, 184, 255, 0.25);
}

textarea::placeholder,
input::placeholder {
  color: #63728b;
}

textarea {
  min-height: 140px;
  resize: vertical;
}

.row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 10px;
  flex-wrap: wrap;
}
.row-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}

.rpc input {
  min-width: 240px;
}

.controls {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.card.list {
  margin-top: 24px;
}

.list-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.counts {
  color: var(--muted);
  font-size: 14px;
}

.counts strong {
  color: var(--text);
  margin: 0 4px;
}

.token {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  min-width: 360px;
  flex-wrap: nowrap;
}

.token-item {
  flex: 1 1 280px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.token-label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: #0e1524;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
  color: var(--text);
}

thead th {
  background: #0f1a2e;
  padding: 12px;
  text-align: left;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
}

tbody tr:nth-child(odd) {
  background: rgba(255, 255, 255, 0.01);
}

tbody td {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.actions-cell {
  text-align: center;
}

.row-remove {
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid var(--border);
  color: #fda4af;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

tr:hover .row-remove {
  opacity: 1;
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(248, 113, 113, 0.14);
}

.row-remove__icon {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 1.7;
  fill: none;
}

.small-input {
  width: 110px;
}

.mono {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
}

.badge {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  display: inline-block;
  border: 1px solid var(--border);
}
.badge.ok {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}
.badge.bad {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}

.list-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-top: 14px;
}

.left-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hint {
  color: var(--muted);
  font-size: 13px;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(9, 14, 25, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  backdrop-filter: blur(2px);
}
.spinner {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 5px solid rgba(255, 255, 255, 0.08);
  border-top-color: var(--primary);
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 860px) {
  .header {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }

  .token {
    min-width: 100%;
    flex-direction: column;
    flex-wrap: wrap;
  }

  .token-item {
    width: 100%;
  }
}
</style>
