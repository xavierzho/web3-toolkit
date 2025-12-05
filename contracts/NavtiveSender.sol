// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NativeSender
 * @notice 批量转账原生代币 (ETH/BNB/etc.) 合约
 * @dev 支持一次交易向多个地址发送不同数量的原生代币
 */
contract NativeSender {
    address public owner;
    bool private locked;

    event Dispersed(address indexed sender, uint256 totalAmount, uint256 recipientCount);
    event Withdrawal(address indexed owner, uint256 amount);

    error InsufficientValue();
    error ArrayLengthMismatch();
    error EmptyArrays();
    error TransferFailed(address recipient);
    error Unauthorized();
    error ReentrancyGuard();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrancyGuard();
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice 批量发送原生代币到多个地址
     * @param recipients 接收地址数组
     * @param amounts 对应的金额数组 (单位: wei)
     * @dev msg.value 必须等于所有金额的总和
     */
    function disperseEther(
        address payable[] calldata recipients,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        uint256 length = recipients.length;
        
        if (length == 0) revert EmptyArrays();
        if (length != amounts.length) revert ArrayLengthMismatch();

        // 计算总金额并验证
        uint256 total = 0;
        for (uint256 i = 0; i < length; i++) {
            total += amounts[i];
        }

        if (msg.value != total) revert InsufficientValue();

        // 执行转账
        for (uint256 i = 0; i < length; i++) {
            (bool success, ) = recipients[i].call{value: amounts[i]}("");
            if (!success) revert TransferFailed(recipients[i]);
        }

        emit Dispersed(msg.sender, total, length);
    }

    /**
     * @notice 批量发送等额原生代币到多个地址
     * @param recipients 接收地址数组
     * @param amount 每个地址接收的金额 (单位: wei)
     * @dev msg.value 必须等于 amount * recipients.length
     */
    function disperseEtherEqual(
        address payable[] calldata recipients,
        uint256 amount
    ) external payable nonReentrant {
        uint256 length = recipients.length;
        
        if (length == 0) revert EmptyArrays();

        uint256 total = amount * length;
        if (msg.value != total) revert InsufficientValue();

        // 执行转账
        for (uint256 i = 0; i < length; i++) {
            (bool success, ) = recipients[i].call{value: amount}("");
            if (!success) revert TransferFailed(recipients[i]);
        }

        emit Dispersed(msg.sender, total, length);
    }

    /**
     * @notice 提取合约中的余额 (紧急情况使用)
     * @dev 只有 owner 可以调用
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = owner.call{value: balance}("");
        if (!success) revert TransferFailed(owner);
        emit Withdrawal(owner, balance);
    }

    /**
     * @notice 转移合约所有权
     * @param newOwner 新的 owner 地址
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    /**
     * @notice 接收原生代币
     */
    receive() external payable {}
}
