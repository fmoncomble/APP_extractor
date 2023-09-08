let selectedFormat = 'txt';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'performExtraction') {
        try {
            const url = message.url;
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
    }
});

async function performExtractAndSave(url) {
    const parser = new DOMParser();
    const response = await fetch(url);
    const html = await response.text();

    const doc = parser.parseFromString(html, 'text/html');

    const speechesDiv = doc.querySelector('tbody');
    if (!speechesDiv) {
        throw new Error('Speeches div not found');
    }

    const paragraphs = speechesDiv.querySelectorAll('.views-field-title');
    const urls = Array.from(paragraphs).map(p =>
        new URL(p.querySelector('a').getAttribute('href'), 'https://www.presidency.ucsb.edu/').href
    );

    const zip = new JSZip();

    const addedFileNames = new Set(); // To track added file names

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

            const title = titleDiv.textContent;
            const text = bodyDiv.textContent;
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
<Text author="${author}" date="${date}">
${title}
${text}
</Text>
            `;
            }

            let baseFileName = `${date}_${author}${extension}`;
            let index = 1;

            addedFileNames.add(baseFileName);

            // Append a number to the file name to make it unique
            while (addedFileNames.has(baseFileName)) {
                baseFileName = `${date}_${author}_${index}${extension}`;
                index++;
            }

            zip.file(baseFileName, fileContent);

        } catch (error) {
            console.error('Error fetching content:', error);
        }
    }));
    const zipBlob = await zip.generateAsync({
        type: 'blob'
    });

    // Use the cleaned pageTitle as the zipFileName
    const zipFileName = `Archive.zip`;

    const downloadPromise = new Promise((resolve, reject) => {
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

    await downloadPromise;

    return Array.from(addedFileNames);
}
