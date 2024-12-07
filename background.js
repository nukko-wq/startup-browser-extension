// タブ情報を整形する関数
function formatTab(tab) {
	return {
		id: tab.id,
		title: tab.title,
		url: tab.url,
		faviconUrl: tab.favIconUrl,
		pinned: tab.pinned,
	}
}

// 現在のWindowのタブ情報を取得（ピン留めされていないタブのみ）
async function getAllTabs() {
	const currentWindow = await chrome.windows.getCurrent()
	const tabs = await chrome.tabs.query({
		windowId: currentWindow.id,
		pinned: false,
	})
	return tabs.map(formatTab)
}

// メッセージ処理を共通化する関数
async function handleMessage(message, sendResponse) {
	try {
		switch (message.type) {
			case 'REQUEST_TABS_UPDATE': {
				const tabs = await getAllTabs()
				sendResponse({ success: true, tabs })
				return
			}

			case 'SWITCH_TO_TAB': {
				await chrome.tabs.update(message.tabId, { active: true })
				sendResponse({ success: true })
				return
			}

			case 'CLOSE_TAB': {
				await chrome.tabs.remove(message.tabId)
				sendResponse({ success: true })
				return
			}

			case 'SET_TOKEN': {
				await chrome.storage.local.set({ token: message.token })
				sendResponse({ success: true })
				return
			}

			case 'CLOSE_ALL_TABS': {
				const currentTab = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				})
				const allTabs = await chrome.tabs.query({
					currentWindow: true,
					pinned: false,
				})

				const tabsToClose = allTabs.filter((tab) => tab.id !== currentTab[0].id)
				if (tabsToClose.length > 0) {
					await chrome.tabs.remove(tabsToClose.map((tab) => tab.id))
				}
				sendResponse({ success: true })
				return
			}

			case 'SORT_TABS_BY_DOMAIN': {
				try {
					const allTabs = await chrome.tabs.query({
						currentWindow: true,
						pinned: false,
					})

					// URLからドメインを取得する関数
					const getDomain = (url) => {
						try {
							return new URL(url).hostname
						} catch {
							return url
						}
					}

					// ドメインでソート
					const sortedTabs = allTabs.sort((a, b) => {
						const domainA = getDomain(a.url)
						const domainB = getDomain(b.url)
						return domainA.localeCompare(domainB)
					})

					// タブの位置を順次更新
					const movePromises = sortedTabs.map((tab, index) =>
						chrome.tabs.move(tab.id, { index }),
					)
					await Promise.all(movePromises)

					sendResponse({ success: true })
				} catch (error) {
					console.error('Error in SORT_TABS_BY_DOMAIN:', error)
					sendResponse({
						success: false,
						error: error.message || 'Failed to sort tabs',
					})
				}
				return true
			}

			case 'FIND_OR_CREATE_STARTUP_TAB': {
				// 既存のStartupタブを探す
				const tabs = await chrome.tabs.query({
					url: ['http://localhost:3000/*'],
				})

				if (tabs.length > 0) {
					// 既存のタブがある場合はそれをアクティブにする
					await chrome.tabs.update(tabs[0].id, { active: true })
					sendResponse({ success: true, tabId: tabs[0].id })
				} else {
					// 新しいタブを作成
					const newTab = await chrome.tabs.create({
						url: 'http://localhost:3000',
						active: true,
					})
					sendResponse({ success: true, tabId: newTab.id })
				}
				return
			}

			case 'SHOW_SPACE_LIST_OVERLAY': {
				// content scriptにオーバーレイ表示を指示
				const tabs = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				})
				if (tabs[0]) {
					await chrome.tabs.sendMessage(tabs[0].id, {
						type: 'SHOW_SPACE_LIST_OVERLAY',
					})
					sendResponse({ success: true })
				} else {
					sendResponse({ success: false, error: 'No active tab found' })
				}
				return
			}

			default:
				sendResponse({ success: false, error: 'Unknown message type' })
				return
		}
	} catch (error) {
		sendResponse({ success: false, error: error.message })
	}
}

// 内部メッセージ（content scriptから）を処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	handleMessage(message, sendResponse).catch((error) => {
		console.error('Error handling message:', error)
		sendResponse({
			success: false,
			error: error.message || 'Unknown error occurred',
		})
	})
	return true // 非同期レスポンスを使用することを示す
})

// 外部メッセージ（Webアプリから直接）を処理
chrome.runtime.onMessageExternal.addListener(
	(message, sender, sendResponse) => {
		handleMessage(message, sendResponse).catch((error) => {
			console.error('Error handling external message:', error)
			sendResponse({
				success: false,
				error: error.message || 'Unknown error occurred',
			})
		})
		return true // 非同期レスポンスを使用することを示す
	},
)

// タブの変更を監視し、Webアプリに通知
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete') {
		await notifyTabsUpdate()
	}
})

// タブの移動を監視し、Webアプリに通知
chrome.tabs.onMoved.addListener(async () => {
	await notifyTabsUpdate()
})

// タブの削除を監視し、Webアプリに通知
chrome.tabs.onRemoved.addListener(async () => {
	await notifyTabsUpdate()
})

// Webアプリへの通知を共通化
async function notifyTabsUpdate() {
	const tabs = await getAllTabs()
	// 登録されているWebアプリにメッセージを送信
	chrome.tabs.query(
		{ url: ['http://localhost:3000/*'] },
		async (matchingTabs) => {
			for (const tab of matchingTabs) {
				try {
					// content scriptが読み込まれているか確認
					await chrome.scripting.executeScript({
						target: { tabId: tab.id },
						func: (tabsData) => {
							window.postMessage(
								{
									source: 'startup-extension',
									type: 'TABS_UPDATED',
									tabs: tabsData,
								},
								'*',
							)
						},
						args: [tabs],
					})
				} catch (error) {
					console.error('Error executing script:', error)
				}
			}
		},
	)
}

// キーボードショートカットの登録
chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'show_space_list') {
		try {
			// まずStartupタブを表示
			await handleMessage({ type: 'FIND_OR_CREATE_STARTUP_TAB' }, () => {})
			// 少し待ってからオーバーレイを表示
			setTimeout(async () => {
				await handleMessage({ type: 'SHOW_SPACE_LIST_OVERLAY' }, () => {})
			}, 500)
		} catch (error) {
			console.error('Error showing space list:', error)
		}
	}
})
