// contentScript.js
console.log('APP content script injected');

if (document.readyState !== 'loading') {
	console.log('Page ready, firing function');
	updateRange();
} else {
	document.addEventListener('DOMContentLoaded', () => {
		console.log('Page was not ready, placing code here');
		updateRange();
	});
}

// Inject the button into the page
const anchor = document.querySelector('.view-header');

const fieldset = document.createElement('fieldset');
fieldset.textContent = 'Extract and save documents in the desired format';
anchor.appendChild(fieldset);

const extractButtonsContainer = document.createElement('div');
extractButtonsContainer.style.display = 'inline';

let selectedFormat = 'txt'

const select = document.createElement('select');
const txt = new Option('TXT', 'txt');
const xml = new Option('XML', 'xml');
select.appendChild(txt);
select.appendChild(xml);

console.log('Output format: ', selectedFormat);

select.addEventListener('change', function() {
    selectedFormat = this.value;
    console.log('Output format: ', selectedFormat);
});

const extractButton = document.createElement('button');
extractButton.id = 'extractButton';
extractButton.textContent = 'Extract & Download';

extractButtonsContainer.appendChild(extractButton);
extractButtonsContainer.appendChild(select);
fieldset.appendChild(extractButtonsContainer);

// Create abort button
const abortButton = document.createElement('button');
abortButton.classList.add('abort-button');
abortButton.textContent = 'Abort';
abortButton.addEventListener('click', () => {
	console.log('Abort button clicked');
	abortButton.textContent = 'Aborting...'
	chrome.runtime.sendMessage({
		action: 'abortExtraction'
	}, response => {
		console.log('Extraction aborted');
	})
});
fieldset.appendChild(abortButton);

// Create a container for the extraction message and spinner
const extractionContainer = document.createElement('div');
extractionContainer.id = 'extractionContainer';
extractionContainer.style.display = 'none'; // Hide initially
fieldset.appendChild(extractionContainer);

// Create the loading spinner element
const spinner = document.createElement('div');
spinner.classList.add('spinner'); // Add a class for styling
extractionContainer.appendChild(spinner);

// Create the extraction message element
const extractionMessage = document.createElement('div');
extractionMessage.id = 'extractionMessage';
extractionMessage.textContent = 'Launching extraction...';
extractionContainer.appendChild(extractionMessage);

function updateRange() {
	console.log('updateRange function invoked');
	let port;
	chrome.runtime.onConnect.addListener(connect);
	function connect(p) {
		port = p;
		console.assert(port.name === 'backgroundjs');
		port.onMessage.addListener((msg) => respond(msg));
		function respond(msg) {
			if (msg) {
				console.log('Message from background: ', msg);
				console.log('Updating range');
				extractionMessage.textContent = `Extracting ${msg} as ${selectedFormat} files...`;
			} else {
				console.error('No message from background');
			}
		}
	}
}

// Create container for downloaded files list
const downloadedFilesContainer = document.createElement('div');
downloadedFilesContainer.classList.add('fileList');
downloadedFilesContainer.style.display = 'none';
fieldset.appendChild(downloadedFilesContainer);

// Message passing to notify the background script when the button is clicked
extractButton.addEventListener('click', () => {
	
	// Hide the extraction buttons
	extractButtonsContainer.style.display = 'none';
	abortButton.style.display = 'inline';

    // Show the extraction container
    extractionContainer.style.display = 'block';
    downloadedFilesContainer.textContent = '';
    downloadedFilesContainer.style.display = 'none';

    chrome.runtime.sendMessage({
        action: 'performExtraction',
        url: window.location.href,
        format: selectedFormat
    }, response => {
        console.log('Response object:', response); // Log the entire response object

        // Hide the extraction container
        extractionContainer.style.display = 'none';
        extractionMessage.textContent = 'Launching extraction...';
        
        // Reset abort button
        abortButton.style.display = 'none';
        abortButton.textContent = 'Abort';
        
        // Restore extraction buttons
        extractButtonsContainer.style.display = 'inline';

        if (response.success) {
            // Display the number of downloaded files
            downloadedFilesContainer.style.display = 'block';
            downloadedFilesContainer.textContent = `Done!\n${response.fetchedUrls.length} files downloaded:\n${response.fetchedUrls.slice(0, 20).join(', ')}...`;
        } else {
            console.error('Error:', response.error);
            // Handle error
        }
    });


});