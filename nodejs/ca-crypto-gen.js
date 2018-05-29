const caUtil = require('./ca');

const userUtil = require('./user');
const logger = require('./logger').new('ca-crypto-gen');
const affiliationUtil = require('./affiliationService');

exports.initAdmin = async (caService, cryptoPath, nodeType, mspId) => {
	const enrollmentID = cryptoPath.userName;
	const enrollmentSecret = 'passwd';

	const {[`${nodeType}OrgName`]: domain} = cryptoPath;

	const type = `${nodeType}User`;
	const userFull = cryptoPath[`${nodeType}UserHostName`];
	const user = await userUtil.loadFromLocal(cryptoPath, nodeType, mspId, undefined);
	if (user) {
		logger.info(`${domain} admin found in local`);
		return user;
	}

	const result = await caService.enroll({enrollmentID, enrollmentSecret});
	caUtil.toMSP(result, cryptoPath, type);
	caUtil.org.saveAdmin(result, cryptoPath, nodeType);

	return await userUtil.build(userFull, result, mspId);
};
/**
 * @param caService
 * @param cryptoPath
 * @param nodeType
 * @param mspId
 * @param affiliationRoot
 * @returns {Promise<*>}
 */
exports.init = async (caService, cryptoPath, nodeType, mspId, {affiliationRoot} = {}) => {
	logger.debug('init', {mspId,}, cryptoPath, nodeType);
	const {[`${nodeType}OrgName`]: domain} = cryptoPath;
	if (!affiliationRoot) affiliationRoot = domain;
	const affiliationService = caService.newAffiliationService();
	const force = true;//true to create recursively


	const adminUser = await exports.initAdmin(caService, cryptoPath, nodeType, mspId,);
	const promises = [affiliationUtil.creatIfNotExist(affiliationService, {name: `${affiliationRoot}.user`, force}, adminUser),
		affiliationUtil.creatIfNotExist(affiliationService, {name: `${affiliationRoot}.peer`, force}, adminUser),
		affiliationUtil.creatIfNotExist(affiliationService, {name: `${affiliationRoot}.orderer`, force}, adminUser)];
	await Promise.all(promises);
	return adminUser;

};
/**
 * @param caService
 * @param {CryptoPath} cryptoPath
 * @param admin
 * @param affiliationRoot
 * @returns {Promise<*>}
 */
exports.genOrderer = async (caService, cryptoPath, admin, {TLS, affiliationRoot} = {}) => {

	const type = 'orderer';
	const {ordererHostName, ordererOrgName: domain} = cryptoPath;
	if (!affiliationRoot) affiliationRoot = domain;
	const ordererMSPRoot = cryptoPath.MSP(type);

	const exist = cryptoPath.cryptoExistLocal(type);
	if (exist) {
		logger.info(`crypto exist in ${ordererMSPRoot}`);
		return;
	}

	const enrollmentID = ordererHostName;
	const enrollmentSecret = 'passwd';
	const certificate = userUtil.getCertificate(admin);
	caUtil.peer.toAdminCerts({certificate}, cryptoPath, type);
	await caUtil.register(caService, {
		enrollmentID,
		enrollmentSecret,
		role: 'orderer',
		affiliation: `${affiliationRoot}.orderer`
	}, admin);

	const result = await caService.enroll({enrollmentID, enrollmentSecret});
	caUtil.toMSP(result, cryptoPath, type);
	if (TLS) {
		const tlsResult = await caService.enroll({enrollmentID, enrollmentSecret, profile: 'tls'});
		caUtil.toTLS(tlsResult, cryptoPath, type);
		caUtil.org.saveTLS(tlsResult, cryptoPath, type);
	}
	return admin;

};
/**
 *
 * @param caService
 * @param {CryptoPath} cryptoPath
 * @param affiliationRoot
 * @param admin
 * @returns {*}
 */
exports.genPeer = async (caService, cryptoPath, admin, {TLS, affiliationRoot} = {}) => {
	const type = 'peer';

	const {peerHostName, peerOrgName: domain} = cryptoPath;
	if (!affiliationRoot) affiliationRoot = domain;
	const peerMSPRoot = cryptoPath.MSP(type);

	const exist = cryptoPath.cryptoExistLocal(type);
	if (exist) {
		logger.info(`crypto exist in ${peerMSPRoot}`);
		return;
	}

	const enrollmentID = peerHostName;
	const enrollmentSecret = 'passwd';
	const certificate = userUtil.getCertificate(admin);
	caUtil.peer.toAdminCerts({certificate}, cryptoPath, type);
	await caUtil.register(caService, {
		enrollmentID,
		enrollmentSecret,
		role: 'peer',
		affiliation: `${affiliationRoot}.peer`
	}, admin);
	const result = await caService.enroll({enrollmentID, enrollmentSecret});
	caUtil.toMSP(result, cryptoPath, type);
	if (TLS) {
		const tlsResult = await caService.enroll({enrollmentID, enrollmentSecret, profile: 'tls'});
		caUtil.toTLS(tlsResult, cryptoPath, type);
		caUtil.org.saveTLS(tlsResult, cryptoPath, type);
	}
};

