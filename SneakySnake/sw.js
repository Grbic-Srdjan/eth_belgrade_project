"use strict";

const OFFLINE_DATA_FILE = "offline.js";
const CACHE_NAME_PREFIX = "c2offline";
const BROADCASTCHANNEL_NAME = "offline";
const CONSOLE_PREFIX = "[SW] ";
const LAZYLOAD_KEYNAME = "";

const broadcastChannel = (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(BROADCASTCHANNEL_NAME));

function PostBroadcastMessage(o)
{
	if (!broadcastChannel) return;
	
	setTimeout(() => broadcastChannel.postMessage(o), 3000);
};

function Broadcast(type)
{
	PostBroadcastMessage({
		"type": type
	});
};

function BroadcastDownloadingUpdate(version)
{
	PostBroadcastMessage({
		"type": "downloading-update",
		"version": version
	});
}

function BroadcastUpdateReady(version)
{
	PostBroadcastMessage({
		"type": "update-ready",
		"version": version
	});
}

function IsUrlInLazyLoadList(url, lazyLoadList)
{
	if (!lazyLoadList)
		return false;
	
	try {
		for (const lazyLoadRegex of lazyLoadList)
		{
			if (new RegExp(lazyLoadRegex).test(url))
				return true;
		}
	}
	catch (err)
	{
		console.error(CONSOLE_PREFIX + "Error matching in lazy-load list: ", err);
	}
	
	return false;
};

function WriteLazyLoadListToStorage(lazyLoadList)
{
	if (typeof localforage === "undefined")
		return Promise.resolve();
	else
		return localforage.setItem(LAZYLOAD_KEYNAME, lazyLoadList)
};

function ReadLazyLoadListFromStorage()
{
	if (typeof localforage === "undefined")
		return Promise.resolve([]);
	else
		return localforage.getItem(LAZYLOAD_KEYNAME);
};

function GetCacheBaseName()
{
	return CACHE_NAME_PREFIX + "-" + self.registration.scope;
};

function GetCacheVersionName(version)
{
	return GetCacheBaseName() + "-v" + version;
};

async function GetAvailableCacheNames()
{
	const cacheNames = await caches.keys();
	const cacheBaseName = GetCacheBaseName();
	return cacheNames.filter(n => n.startsWith(cacheBaseName));
};

async function IsUpdatePending()
{
	const availableCacheNames = await GetAvailableCacheNames();
	return (availableCacheNames.length >= 2);
};

async function GetMainPageUrl()
{
	const allClients = await clients.matchAll({
		includeUncontrolled: true,
		type: "window"
	});
	
	for (const c of allClients)
	{

		let url = c.url;
		if (url.startsWith(self.registration.scope))
			url = url.substring(self.registration.scope.length);
		
		if (url && url !== "/")	
		{
			if (url.startsWith("?"))
				url = "/" + url;
			
			return url;
		}
	}
	
	return "";
};

function fetchWithBypass(request, bypassCache)
{
	if (typeof request === "string")
		request = new Request(request);
	
	if (bypassCache)
	{
		const url = new URL(request.url);
		url.search += Math.floor(Math.random() * 1000000);

		return fetch(url, {
			headers: request.headers,
			mode: request.mode,
			credentials: request.credentials,
			redirect: request.redirect,
			cache: "no-store"
		});
	}
	else { return fetch(request); }
};

async function CreateCacheFromFileList(cacheName, fileList, bypassCache)
{
	const responses = await Promise.all(fileList.map(url => fetchWithBypass(url, bypassCache)));
	let allOk = true;
	for (const response of responses)
	{
		if (!response.ok)
		{
			allOk = false;
			console.error(CONSOLE_PREFIX + "Error fetching '" + response.url + "' (" + response.status + " " + response.statusText + ")");
		}
	}
	
	if (!allOk)
		throw new Error("not all resources were fetched successfully");

	const cache = await caches.open(cacheName);
	
	try {
		return await Promise.all(responses.map(
			(response, i) => cache.put(fileList[i], response)
		));
	}
	catch (err)
	{
		console.error(CONSOLE_PREFIX + "Error writing cache entries: ", err);
		caches.delete(cacheName);
		throw err;
	}
};

async function UpdateCheck(isFirst)
{
	try {
		const response = await fetchWithBypass(OFFLINE_DATA_FILE, true);
		if (!response.ok)
			throw new Error(OFFLINE_DATA_FILE + " responded with " + response.status + " " + response.statusText);
			
		const data = await response.json();
		const version = data.version;
		const fileList = data.fileList;
		const lazyLoadList = data.lazyLoad;
		const currentCacheName = GetCacheVersionName(version);
		const cacheExists = await caches.has(currentCacheName);
		if (cacheExists)
		{
			const isUpdatePending = await IsUpdatePending();
			if (isUpdatePending)
			{
				console.log(CONSOLE_PREFIX + "Update pending");
				Broadcast("update-pending");
			}
			else
			{
				console.log(CONSOLE_PREFIX + "Up to date");
				Broadcast("up-to-date");
			}
			return;
		}
		
		const mainPageUrl = await GetMainPageUrl();
		
		fileList.unshift("./");
		
		if (mainPageUrl && fileList.indexOf(mainPageUrl) === -1)
			fileList.unshift(mainPageUrl);
		
		console.log(CONSOLE_PREFIX + "Caching " + fileList.length + " files for offline use");
		
		if (isFirst)
			Broadcast("downloading");
		else
			BroadcastDownloadingUpdate(version);
		
		if (lazyLoadList)
			await WriteLazyLoadListToStorage(lazyLoadList);
		
		await CreateCacheFromFileList(currentCacheName, fileList, !isFirst);
		const isUpdatePending = await IsUpdatePending();
		
		if (isUpdatePending)
		{
			console.log(CONSOLE_PREFIX + "All resources saved, update ready");
			BroadcastUpdateReady(version);
		}
		else
		{
			console.log(CONSOLE_PREFIX + "All resources saved, offline support ready");
			Broadcast("offline-ready");
		}
	}
	catch (err)
	{
		console.warn(CONSOLE_PREFIX + "Update check failed: ", err);
	}
};

self.addEventListener("install", event =>
{
	event.waitUntil(
		UpdateCheck(true)
		.catch(() => null)
	);
});

async function GetCacheNameToUse(availableCacheNames, doUpdateCheck)
{
	if (availableCacheNames.length === 1 || !doUpdateCheck)
		return availableCacheNames[0];
	
	const allClients = await clients.matchAll();
	
	if (allClients.length > 1)
		return availableCacheNames[0];
	
	const latestCacheName = availableCacheNames[availableCacheNames.length - 1];
	console.log(CONSOLE_PREFIX + "Updating to new version");
	
	await Promise.all(
		availableCacheNames.slice(0, -1)
		.map(c => caches.delete(c))
	);
	
	return latestCacheName;
};

async function HandleFetch(event, doUpdateCheck)
{
	const availableCacheNames = await GetAvailableCacheNames();
	
	if (!availableCacheNames.length)
		return fetch(event.request);
	
	const useCacheName = await GetCacheNameToUse(availableCacheNames, doUpdateCheck);
	const cache = await caches.open(useCacheName);
	const cachedResponse = await cache.match(event.request);
	
	if (cachedResponse)
		return cachedResponse;
	
	const result = await Promise.all([fetch(event.request), ReadLazyLoadListFromStorage()]);
	const fetchResponse = result[0];
	const lazyLoadList = result[1];
	
	if (IsUrlInLazyLoadList(event.request.url, lazyLoadList))
	{
		try {
			await cache.put(event.request, fetchResponse.clone());
		}
		catch (err)
		{
			console.warn(CONSOLE_PREFIX + "Error caching '" + event.request.url + "': ", err);
		}
	}
		
	return fetchResponse;
};

self.addEventListener("fetch", event =>
{
	if (new URL(event.request.url).origin !== location.origin)
		return;
		
	const doUpdateCheck = (event.request.mode === "navigate");
	
	const responsePromise = HandleFetch(event, doUpdateCheck);

	if (doUpdateCheck)
	{
		event.waitUntil(
			responsePromise
			.then(() => UpdateCheck(false))
		);
	}

	event.respondWith(responsePromise);
});