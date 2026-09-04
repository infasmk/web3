// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 */
abstract contract Ownable is Context {
    address private _owner;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

/**
 * @dev Contract module which provides access control mechanism, where
 * ownership can be transferred to a new owner in two steps.
 */
abstract contract Ownable2Step is Ownable {
    address private _pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    function pendingOwner() public view virtual returns (address) {
        return _pendingOwner;
    }

    function transferOwnership(address newOwner) public virtual override onlyOwner {
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner(), newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual override {
        delete _pendingOwner;
        super._transferOwnership(newOwner);
    }

    function acceptOwnership() public virtual {
        address sender = _msgSender();
        if (pendingOwner() != sender) {
            revert OwnableUnauthorizedAccount(sender);
        }
        _transferOwnership(sender);
    }
}

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 */
abstract contract Pausable is Context {
    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    error EnforcedPause();
    error ExpectedPause();

    constructor() {
        _paused = false;
    }

    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    modifier whenPaused() {
        _requirePaused();
        _;
    }

    function paused() public view virtual returns (bool) {
        return _paused;
    }

    function _requireNotPaused() internal view virtual {
        if (paused()) {
            revert EnforcedPause();
        }
    }

    function _requirePaused() internal view virtual {
        if (!paused()) {
            revert ExpectedPause();
        }
    }

    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 */
abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        _status = NOT_ENTERED;
    }

    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    error AddressEmptyCode(address target);
    error FailedInnerCall();

    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0);
    }

    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        if (address(this).balance < value) {
            revert("Address: insufficient balance for call");
        }
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata
    ) internal view returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            if (returndata.length == 0 && target.code.length == 0) {
                revert AddressEmptyCode(target);
            }
            return returndata;
        }
    }

    function _revert(bytes memory returndata) private pure {
        if (returndata.length > 0) {
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert FailedInnerCall();
        }
    }
}

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported.
 */
library SafeERC20 {
    using Address for address;

    error SafeERC20FailedOperation(address token);

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        bytes memory returndata = address(token).functionCall(data);
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) {
            revert SafeERC20FailedOperation(address(token));
        }
    }
}

/**
 * @title BEP20PaymentGateway (Flattened)
 * @author Senior Web3 & Smart Contract Security Engineer
 * @notice Production-grade gasless payment gateway for BEP-20 tokens on BNB Smart Chain (BSC).
 * @dev Customers approve the exact purchase amount to this contract. Authorized backend relayers
 * execute settlements on-chain and pay BNB gas fees. Payments are transferred directly to treasury.
 */
contract BEP20PaymentGateway is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    // CUSTOM ERRORS (GAS OPTIMIZED)
    // ============================================================
    error ZeroAddress();
    error ZeroAmount();
    error UnauthorizedRelayer(address caller);
    error OrderAlreadyProcessed(bytes32 orderId);
    error InsufficientCustomerBalance(uint256 available, uint256 required);
    error InsufficientCustomerAllowance(uint256 available, uint256 required);
    error BatchArrayMismatch();

    // ============================================================
    // STATE VARIABLES
    // ============================================================
    /// @notice Merchant treasury address receiving customer payments
    address public treasury;

    /// @notice Mapping of authorized backend relayer addresses (relayer => isAuthorized)
    mapping(address => bool) public isRelayer;

    /// @notice Cryptographic replay attack prevention (orderId => processed)
    mapping(bytes32 => bool) public processedOrders;

    // ============================================================
    // STRUCTS
    // ============================================================
    struct PaymentRequest {
        address token;
        address customer;
        uint256 amount;
        bytes32 orderId;
    }

    // ============================================================
    // EVENTS
    // ============================================================
    event PaymentProcessed(
        address indexed customer,
        address indexed token,
        address indexed treasury,
        uint256 amount,
        bytes32 orderId,
        uint256 timestamp
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event RelayerStatusUpdated(address indexed relayer, bool status);
    event EmergencyTokensRescued(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyBNBRescued(address indexed recipient, uint256 amount);

    // ============================================================
    // MODIFIERS
    // ============================================================
    modifier onlyRelayer() {
        if (!isRelayer[msg.sender]) {
            revert UnauthorizedRelayer(msg.sender);
        }
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================
    /**
     * @notice Initializes the payment gateway.
     * @param _initialOwner The owner address (with 2-step transfer capability).
     * @param _treasury The initial merchant treasury wallet receiving settlements.
     * @param _initialRelayer An initial authorized backend relayer address.
     */
    constructor(
        address _initialOwner,
        address _treasury,
        address _initialRelayer
    ) Ownable(_initialOwner) {
        if (_initialOwner == address(0) || _treasury == address(0)) revert ZeroAddress();

        treasury = _treasury;
        emit TreasuryUpdated(address(0), _treasury);

        if (_initialRelayer != address(0)) {
            isRelayer[_initialRelayer] = true;
            emit RelayerStatusUpdated(_initialRelayer, true);
        }
    }

    // ============================================================
    // EXTERNAL SETTLEMENT FUNCTIONS
    // ============================================================
    /**
     * @notice Processes a BEP-20 payment on behalf of a customer.
     * @dev Gas is paid by the authorized relayer. Tokens are transferred directly from customer to treasury.
     * @param token Address of the BEP-20 token (e.g., USDT: 0x55d398326f99059fF775485246999027B3197955).
     * @param customer Customer address who signed the ERC-20 approval.
     * @param amount Exact token amount in base units (wei / decimals).
     * @param orderId Unique cryptographic 32-byte order hash to prevent replay attacks.
     */
    function processPayment(
        address token,
        address customer,
        uint256 amount,
        bytes32 orderId
    ) external onlyRelayer whenNotPaused nonReentrant {
        _executePayment(token, customer, amount, orderId);
    }

    /**
     * @notice Processes multiple BEP-20 payments in a single transaction to optimize relayer gas fees.
     * @param payments Array of PaymentRequest structs.
     */
    function batchProcessPayments(
        PaymentRequest[] calldata payments
    ) external onlyRelayer whenNotPaused nonReentrant {
        uint256 len = payments.length;
        if (len == 0) revert ZeroAmount();

        for (uint256 i = 0; i < len; ) {
            _executePayment(
                payments[i].token,
                payments[i].customer,
                payments[i].amount,
                payments[i].orderId
            );
            unchecked {
                ++i;
            }
        }
    }

    // ============================================================
    // INTERNAL LOGIC
    // ============================================================
    function _executePayment(
        address token,
        address customer,
        uint256 amount,
        bytes32 orderId
    ) internal {
        if (token == address(0) || customer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (processedOrders[orderId]) revert OrderAlreadyProcessed(orderId);

        // Mark orderId as processed immediately to prevent reentrancy / replay
        processedOrders[orderId] = true;

        IERC20 tokenContract = IERC20(token);

        // Pre-flight state validation
        uint256 customerBalance = tokenContract.balanceOf(customer);
        if (customerBalance < amount) {
            revert InsufficientCustomerBalance(customerBalance, amount);
        }

        uint256 customerAllowance = tokenContract.allowance(customer, address(this));
        if (customerAllowance < amount) {
            revert InsufficientCustomerAllowance(customerAllowance, amount);
        }

        // Execute safe transfer directly from customer to merchant treasury
        tokenContract.safeTransferFrom(customer, treasury, amount);

        emit PaymentProcessed(customer, token, treasury, amount, orderId, block.timestamp);
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================
    /**
     * @notice Checks if an order ID has already been executed.
     * @param orderId The 32-byte order identifier.
     */
    function isOrderProcessed(bytes32 orderId) external view returns (bool) {
        return processedOrders[orderId];
    }

    /**
     * @notice Validates customer balance and allowance readiness prior to relayer submission.
     * @param token Address of the BEP-20 token.
     * @param customer Customer address.
     * @param amount Required payment amount.
     * @return ready True if balance and allowance are both sufficient.
     * @return balance Available token balance.
     * @return allowance Available allowance granted to this gateway.
     */
    function checkPaymentReadiness(
        address token,
        address customer,
        uint256 amount
    ) external view returns (bool ready, uint256 balance, uint256 allowance) {
        if (token == address(0) || customer == address(0)) return (false, 0, 0);
        IERC20 tokenContract = IERC20(token);
        balance = tokenContract.balanceOf(customer);
        allowance = tokenContract.allowance(customer, address(this));
        ready = (balance >= amount && allowance >= amount);
    }

    // ============================================================
    // ADMIN FUNCTIONS (OWNABLE2STEP)
    // ============================================================
    /**
     * @notice Updates the merchant treasury address.
     * @param newTreasury New recipient address.
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Authorizes or deauthorizes a backend relayer address.
     * @param relayer Relayer public address.
     * @param status True to authorize, false to revoke.
     */
    function setRelayer(address relayer, bool status) external onlyOwner {
        if (relayer == address(0)) revert ZeroAddress();
        isRelayer[relayer] = status;
        emit RelayerStatusUpdated(relayer, status);
    }

    /**
     * @notice Emergency pause for all payment processing.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resume payment processing.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============================================================
    // EMERGENCY RESCUE FUNCTIONS
    // ============================================================
    /**
     * @notice Rescues tokens accidentally transferred directly to this contract.
     * @param token Token contract address.
     * @param recipient Destination address.
     * @param amount Amount to withdraw.
     */
    function rescueTokens(address token, address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(recipient, amount);
        emit EmergencyTokensRescued(token, recipient, amount);
    }

    /**
     * @notice Rescues native BNB accidentally sent to this contract.
     * @param recipient Recipient address.
     */
    function rescueBNB(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance == 0) revert ZeroAmount();
        (bool success, ) = recipient.call{value: balance}("");
        require(success, "BNB transfer failed");
        emit EmergencyBNBRescued(recipient, balance);
    }

    receive() external payable {}
}
