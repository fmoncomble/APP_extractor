let selectedFormat = 'txt';
let url;
let doc;
let abortExtraction = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'performExtraction') {
        try {
            url = message.url + "&page=0";
            performExtractAndSave(url)
                .then(fetchedUrls => {
                    sendResponse({
                        success: true,
                        fetchedUrls
                    });
                })
                .catch(error => {
                    console.error('Error:', error);
                    sendResponse({
                        success: false,
                        error: 'An error occurred'
                    });
                });

            return true; // Indicate that sendResponse will be called asynchronously

        } catch (error) {
            console.error('Error:', error);
            sendResponse({
                success: false,
                error: 'An error occurred'
            });
        }
    } else if (message.action === 'setFormat') {
        selectedFormat = message.format;
    } else if (message.action === 'abortExtraction') {
    	abortExtraction = true;
    }
});

async function performExtractAndSave(initialUrl) {
    const parser = new DOMParser();
    let nextUrl = initialUrl;
    const fetchedUrls = new Set();
    
    const zip = new JSZip();
    const addedFileNames = new Set(); // To track added file names
    
    while (nextUrl) {
    	try {
    		console.log('Search page URL = ', nextUrl);
			const response = await fetch(nextUrl);
			const html = await response.text();
			doc = parser.parseFromString(html, 'text/html');
			
			const resultsRangeContainer = doc.querySelector('div.view-header');
			const resultsRange = resultsRangeContainer.querySelector('h3').textContent.replace('Results', '').replace('records found', 'documents').trim();
			console.log ('Results range = ', resultsRange);
			
			function sendRange() {
				console.log('sendRange function invoked');
				let currentTab;
				chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
					currentTab = tabs[0];
					console.log('Current tab: ', currentTab);
					
					let port = chrome.tabs.connect(currentTab.id, { name: 'backgroundjs' });
					port.postMessage(resultsRange);
				});
			}
			
			sendRange();
			
			const speechesDiv = doc.querySelector('tbody');
			if (!speechesDiv) {
				throw new Error('Speeches div not found');
			}

			const paragraphs = speechesDiv.querySelectorAll('.views-field-title');
			const urls = Array.from(paragraphs).map(p =>
				new URL(p.querySelector('a').getAttribute('href'), 'https://www.presidency.ucsb.edu/').href
			);
			
			fetchedUrls.add(...urls);

			await Promise.all(urls.map(async url => {
				try {
					const contentResponse = await fetch(url);
					console.log('URL = ', contentResponse);
					const content = await contentResponse.text();
					const contentDoc = parser.parseFromString(content, 'text/html');

					const titleDiv = contentDoc.querySelector('.field-ds-doc-title');
					const bodyDiv = contentDoc.querySelector('.field-docs-content');
					const authorElement = contentDoc.querySelector('.diet-title');
					const dateElement = contentDoc.querySelector('.date-display-single');

					if (!bodyDiv || !authorElement) {
						console.error('Error: Required elements not found for ', authorElement.querySelector('a').textContent);
						return;
					}

					const title = titleDiv.textContent.trim().replaceAll("\"", "");
					const text = bodyDiv.textContent.trim().replaceAll("\&", "and");
					const author = authorElement.querySelector('a').textContent;
					const dateString = dateElement ? dateElement.textContent : 'Unknown Date';

					// Function to convert date into ISO format (YYYY-MM-DD)
					function convertDateToISO(dateString) {
						const monthMap = {
							January: '01',
							February: '02',
							March: '03',
							April: '04',
							May: '05',
							June: '06',
							July: '07',
							August: '08',
							September: '09',
							October: '10',
							November: '11',
							December: '12',
						};
						const datePattern = /(\w+) (\d{1,2}), (\d{4})/u;
						const match = dateString.match(datePattern);
						if (match) {
							let day = match[2];
							const month = monthMap[match[1]];
							const year = match[3];
							if (day.length === 1) {
								day = '0' + day;
							}
							if (day && month && year) {
								return `${year}-${month}-${day}`;
							}
						}
						return null;
					}

					const date = convertDateToISO(dateString);
					console.log('Speech date: ', date);

					let extension = '.txt'

					let fileContent = `
		${author}
		${date}
		${title}
		${text}
			  `;

					if (selectedFormat === 'xml') {
						extension = '.xml';
						fileContent = `
		<text author="${author}" title="${title}" date="${date}">
		<ref target="${url}">Link to original document</ref><lb></lb><lb></lb>
		${text}
		</text>
					`;
					}

					let baseFileName = `${date}_${author}${extension}`;
					let index = 1;

					// Append a number to the file name to make it unique
					while (addedFileNames.has(baseFileName)) {
						baseFileName = `${date}_${author}_${index}${extension}`;
						index++;
					}

					addedFileNames.add(baseFileName);

					zip.file(baseFileName, fileContent);

				} catch (error) {
					console.error('Error fetching content:', error);
				}
			}));
			
			if (abortExtraction) {
				console.log('Extraction aborted');
				break;
			}
	
			nextUrl = getNextPageUrl();
		} catch (error) {
			console.error('Error: ', error);
		}
	}
    
    const zipBlob = await zip.generateAsync({
        type: 'blob'
    });

    const zipFileName = `APP_archive.zip`;
    
    await downloadZip(zipBlob, zipFileName);
    
    return Array.from(addedFileNames).length;
}

function getNextPageUrl() {
	const nextButton = doc.querySelector('a[title="Go to next page"]');
    if (nextButton) {
    	console.log('Next button found: ', nextButton);
    	return new URL(nextButton.getAttribute('href'), 'https://www.presidency.ucsb.edu').href;
    } else {
    	console.log('No next button')
    	return null;
    }
}

async function downloadZip(zipBlob, zipFileName) {
	return new Promise((resolve, reject) => {
        if (typeof browser !== 'undefined' && browser.downloads) {
            browser.downloads.download({
                url: URL.createObjectURL(zipBlob),
                filename: zipFileName,
                saveAs: false,
            }).then(downloadItem => {
                if (downloadItem) {
                    resolve(zipFileName);
                } else {
                    reject(new Error(`Failed to initiate download for ${zipFileName}`));
                }
            }).catch(reject);
        } else if (typeof chrome !== 'undefined' && chrome.downloads) {
            chrome.downloads.download({
                url: URL.createObjectURL(zipBlob),
                filename: zipFileName,
                saveAs: true,
            }, downloadId => {
                if (downloadId) {
                    resolve(zipFileName);
                } else {
                    reject(new Error(`Failed to initiate download for ${zipFileName}`));
                }
            });
        } else {
            reject(new Error('Download API not available'));
        }
    });
}