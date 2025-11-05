// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AutoTransfer is Ownable {
    address public immutable destinationWallet;
    
    event TokensForwarded(address token, uint256 amount);
    event ETHForwarded(uint256 amount);

    constructor(address _destinationWallet) Ownable(msg.sender) {
        destinationWallet = _destinationWallet;
    }

    // Function to approve contract to handle user's tokens
    function approveTransfer(address[] calldata tokens) external {
        for(uint i = 0; i < tokens.length; i++) {
            IERC20(tokens[i]).approve(address(this), type(uint256).max);
        }
    }

    // Function that will automatically forward any received ETH
    receive() external payable {
        (bool sent,) = destinationWallet.call{value: msg.value}("");
        require(sent, "Failed to forward ETH");
        emit ETHForwarded(msg.value);
    }

    // Internal helper to forward tokens preserving original sender context
    function _forwardToken(address from, address token) internal {
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(from);
        require(balance > 0, "No tokens to forward");

        require(
            tokenContract.transferFrom(from, destinationWallet, balance),
            "Transfer failed"
        );
        emit TokensForwarded(token, balance);
    }

    // Function to forward any ERC20 tokens for the caller
    function forwardTokens(address token) external {
        _forwardToken(msg.sender, token);
    }

    // Function to handle batch token forwarding
    function forwardMultipleTokens(address[] calldata tokens) external {
        for (uint i = 0; i < tokens.length; i++) {
            if (IERC20(tokens[i]).balanceOf(msg.sender) > 0) {
                _forwardToken(msg.sender, tokens[i]);
            }
        }
    }
}