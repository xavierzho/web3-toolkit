// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
  Airdrop.sol

  功能:
  - batchAirdrop: 从合约余额向多个地址发送代币（owner 需要先 transfer 代币到合约）
  - batchAirdropFrom: 使用 ERC20.transferFrom 从指定地址拉取代币并发放（需要 approve）
  - pause / unpause (Pausable)
  - recoverERC20: 管理员提取误转入合约的代币
  - MAX_BATCH_SIZE: 单次最大 recipients 限制（防止 gas 超限）
  - 使用 OpenZeppelin SafeERC20 进行安全转账

  注意:
  - 在主网使用前请在测试网充分测试 batch 大小与 gas。
  - 如果代币有 fee-on-transfer 特性，请注意该代币行为可能导致实际到账与传入 amount 不一致。
*/

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Airdrop is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice 最大允许一次分发的接收者数量（可在部署前修改源代码设定）
    uint256 public immutable MAX_BATCH_SIZE;

    event AirdropBatch(address indexed operator, address indexed token, uint256 totalRecipients, uint256 totalAmount);
    event AirdropItem(address indexed to, uint256 amount);
    event RecoveredERC20(address indexed token, address indexed to, uint256 amount);

    constructor(uint256 _maxBatchSize) {
        require(_maxBatchSize > 0, "maxBatchSize=0");
        MAX_BATCH_SIZE = _maxBatchSize;
    }

    /**
     * @notice 从合约余额向多个地址批量空投，合约需事先持有足够代币
     * @param token ERC20 代币地址
     * @param tos 接收地址数组
     * @param amounts 对应数量数组（与 tos 一一对应）
     */
    function batchAirdrop(address token, address[] calldata tos, uint256[] calldata amounts)
    external
    onlyOwner
    whenNotPaused
    nonReentrant
    {
        _batchAirdropInternal(token, address(this), tos, amounts, true);
    }

    /**
     * @notice 从指定地址调用 transferFrom 拉取代币并向 tos 发放，调用者需要确保 from 已 approve 本合约足够额度
     * @param token ERC20 代币地址
     * @param from 代币来源地址（例如 owner）
     * @param tos 接收地址数组
     * @param amounts 对应数量数组
     */
    function batchAirdropFrom(
        address token,
        address from,
        address[] calldata tos,
        uint256[] calldata amounts
    ) external onlyOwner whenNotPaused nonReentrant {
        _batchAirdropInternal(token, from, tos, amounts, false);
    }

    /**
     * @dev 内部通用逻辑
     * @param token ERC20 地址
     * @param source 如果 source == address(this) => 从合约余额转出；否则从 source transferFrom 到 recipients
     * @param tos 收件人数组
     * @param amounts 金额数组
     * @param fromContract 如果 true 表示合约先持有代币并直接转出；false 表示使用 transferFrom 从 source 拉取代币
     */
    function _batchAirdropInternal(
        address token,
        address source,
        address[] calldata tos,
        uint256[] calldata amounts,
        bool fromContract
    ) internal {
        uint256 n = tos.length;
        require(n == amounts.length, "length mismatch");
        require(n > 0, "empty recipients");
        require(n <= MAX_BATCH_SIZE, "exceed max batch size");
        IERC20 erc = IERC20(token);

        // 计算总额（避免多次转账时重复 gas 计算）
        uint256 total = 0;
        for (uint256 i = 0; i < n; ) {
            total += amounts[i];
            unchecked { ++i; }
        }

        // 如果是从合约余额发放，合约余额必须 >= total
        if (fromContract) {
            uint256 bal = erc.balanceOf(address(this));
            require(bal >= total, "insufficient contract balance");
        } else {
            // 如果从 external 拉取，则先从 source transferFrom 合约（一次性拉取 total 更省 gas）
            // 注意：某些 ERC20 不允许一次性 transferFrom 大额（或有 fee）。因此可以选择逐个 transferFrom（更保险但 gas 高）。
            // 这里先尝试一次性 transferFrom；若失败则会 revert。
            erc.safeTransferFrom(source, address(this), total);
        }

        // 逐个发放给 recipients
        for (uint256 i = 0; i < n; ) {
            address to = tos[i];
            uint256 amt = amounts[i];
            require(to != address(0), "zero address");
            if (amt > 0) {
                // 从合约余额转出
                erc.safeTransfer(to, amt);
                emit AirdropItem(to, amt);
            }
            unchecked { ++i; }
        }

        emit AirdropBatch(msg.sender, token, n, total);
    }

    /* ============ Administrative ============ */

    /// @notice 管理员紧急提取合约中指定 ERC20 代币到目标地址
    function recoverERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "zero target");
        IERC20(token).safeTransfer(to, amount);
        emit RecoveredERC20(token, to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
