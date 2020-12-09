const fs = require('fs')
const chalk = require('chalk')
const { config, ethers } = require('hardhat')
const { utils } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash

use(solidity)

const addresses = {}

const NO_AUTO_DEPLOY = [
  'PublicResolver.sol',
  'SubdomainRegistrar.sol',
  'RestrictedNameWrapper.sol',
]

function readArgumentsFile(contractName) {
  let args = []
  try {
    const argsFile = `./contracts/${contractName}.args`
    if (fs.existsSync(argsFile)) {
      args = JSON.parse(fs.readFileSync(argsFile))
    }
  } catch (e) {
    console.log(e)
  }

  return args
}

const isSolidity = (fileName) =>
  fileName.indexOf('.sol') >= 0 && fileName.indexOf('.swp.') < 0

async function autoDeploy() {
  const contractList = fs.readdirSync(config.paths.sources)
  return contractList
    .filter((fileName) => {
      if (NO_AUTO_DEPLOY.includes(fileName)) {
        //don't auto deploy this list of Solidity files
        return false
      }
      return isSolidity(fileName)
    })
    .reduce((lastDeployment, fileName) => {
      const contractName = fileName.replace('.sol', '')
      const args = readArgumentsFile(contractName)

      // Wait for last deployment to complete before starting the next
      return lastDeployment.then((resultArrSoFar) =>
        deploy(contractName, args).then((result) => [...resultArrSoFar, result])
      )
    }, Promise.resolve([]))
}

async function deploy(name, _args) {
  const args = _args || []

  console.log(`📄 ${name}`)
  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  console.log(chalk.cyan(name), 'deployed to:', chalk.magenta(contract.address))
  fs.writeFileSync(`artifacts/${name}.address`, contract.address)
  console.log('\n')
  contract.name = name
  addresses[name] = contract.address
  return contract
}

describe('My Dapp', function () {
  let ENSRegistry
  let RestrictedNameWrapper
  let PublicResolver
  let SubDomainRegistrar

  describe('YourContract', function () {
    it('Should deploy ENS contracts', async function () {
      EnsRegistry = await deploy('ENSRegistry')
      const ROOT_NODE =
        '0x0000000000000000000000000000000000000000000000000000000000000000'

      const rootOwner = await EnsRegistry.owner(ROOT_NODE)
      const [owner, addr1] = await ethers.getSigners()
      const account = await owner.getAddress()

      RestrictedNameWrapper = await deploy('RestrictedNameWrapper', [
        EnsRegistry.address,
      ])
      PublicResolver = await deploy('PublicResolver', [
        addresses['ENSRegistry'],
        addresses['RestrictedNameWrapper'],
      ])

      SubDomainRegistrar = await deploy('SubdomainRegistrar', [
        addresses['ENSRegistry'],
        addresses['RestrictedNameWrapper'],
      ])

      // setup .eth
      await EnsRegistry.setSubnodeOwner(
        ROOT_NODE,
        utils.keccak256(utils.toUtf8Bytes('eth')),
        account
      )

      // setup vitalik.eth
      await EnsRegistry.setSubnodeOwner(
        namehash('eth'),
        utils.keccak256(utils.toUtf8Bytes('vitalik')),
        account
      )

      // setup ens.eth
      await EnsRegistry.setSubnodeOwner(
        namehash('eth'),
        utils.keccak256(utils.toUtf8Bytes('ens')),
        account
      )

      const ethOwner = await EnsRegistry.owner(namehash('eth'))
      const ensEthOwner = await EnsRegistry.owner(namehash('ens.eth'))

      console.log('ethOwner', ethOwner)
      console.log('ensEthOwner', ensEthOwner)

      // console.log(
      //   'ens.setApprovalForAll RestrictedNameWrapper',
      //   account,
      //   addresses['RestrictedNameWrapper']
      // )
      // // make wrapper approved for account owning ens.eth
      // await EnsRegistry.setApprovalForAll(addresses['RestrictedNameWrapper'], true)

      console.log(
        'ens.setApprovalForAll SubDomainRegistrar',
        SubDomainRegistrar.address,
        true
      )
      await EnsRegistry.setApprovalForAll(SubDomainRegistrar.address, true)
      console.log(
        'RestrictedNameWrapper.setApprovalForAll SubDomainRegistrar',
        SubDomainRegistrar.address,
        true
      )
      await RestrictedNameWrapper.setApprovalForAll(
        SubDomainRegistrar.address,
        true
      )
    })

    describe('configureDomain', function () {
      it('Should be able to configure a new domain', async function () {
        await SubDomainRegistrar.configureDomain(
          namehash('vitalik.eth'),
          '1000000',
          0
        )

        // TODO: assert vitalik.eth has been configured
      })

      it('Should be able to configure a new domain and then register', async function () {
        const [owner, addr1] = await ethers.getSigners()
        const account = await owner.getAddress()

        await SubDomainRegistrar.configureDomain(
          namehash('ens.eth'),
          '1000000',
          0
        )

        const tx = PublicResolver.interface.encodeFunctionData(
          'setAddr(bytes32,uint256,bytes)',
          [namehash('awesome.ens.eth'), 60, account]
        )

        await SubDomainRegistrar.register(
          namehash('ens.eth'),
          'awesome',
          account,
          account,
          addresses['PublicResolver'],
          [tx],
          {
            value: '1000000',
          }
        )
      })

      it('Should be able to configure a new domain and then register fails because namehash does not match', async function () {
        const [owner, addr1] = await ethers.getSigners()
        const account = await owner.getAddress()

        const tx = PublicResolver.interface.encodeFunctionData(
          'setAddr(bytes32,uint256,bytes)',
          [namehash('awesome.ens.eth'), 60, account]
        )

        //should fail as tx is not correct
        await expect(
          SubDomainRegistrar.register(
            namehash('ens.eth'),
            'othername',
            account,
            account,
            addresses['PublicResolver'],
            [tx],
            {
              value: '1000000',
            }
          )
        ).to.be.revertedWith('namehash does not match in calldata')
      })
    })
  })
})