// contentScript.js

// Inject the button into the page
const anchor = document.querySelector('.view-header');

const fieldset = document.createElement('fieldset');
fieldset.textContent = 'Extract and save documents in the desired format';
anchor.appendChild(fieldset);

const select = document.createElement('select');
const txt = new Option ('TXT', 'txt');
const xml = new Option ('XML', 'xml');
select.appendChild(txt);
select.appendChild(xml);

select.addEventListener('change', function() {
	selectedFormat = this.value;
	browser.runtime.sendMessage({action: 'setFormat', format: selectedFormat}, response => {
		console.log('Chosen format: ', response);
		}
	)
});

const extractButton = document.createElement('button');
extractButton.id = 'extractButton';
extractButton.textContent = 'Extract & Download';

fieldset.appendChild(extractButton);
fieldset.appendChild(select);

// Create a container for the extraction message and spinner
const extractionContainer = document.createElement('div');
extractionContainer.id = 'extractionContainer';
extractionContainer.style.display = 'none'; // Hide initially
fieldset.appendChild(extractionContainer);

// Create the extraction message element
const extractionMessage = document.createElement('div');
extractionMessage.id = 'extractionMessage';
extractionMessage.textContent = 'Extracting…';
extractionContainer.appendChild(extractionMessage);

// Create the loading spinner element
const spinner = document.createElement('div');
spinner.classList.add('spinner'); // Add a class for styling
extractionContainer.appendChild(spinner);

// Message passing to notify the background script when the button is clicked
extractButton.addEventListener('click', () => {
  // Show the extraction container
  extractionContainer.style.display = 'block';

browser.runtime.sendMessage({ action: 'performExtraction', url: window.location.href }, response => {
  console.log('Response object:', response); // Log the entire response object

  // Hide the extraction container
  extractionContainer.style.display = 'none';

  if (response.success) {
    // Display the downloaded files
    const downloadedFilesContainer = document.createElement('div');
    downloadedFilesContainer.classList.add('fileList');
    downloadedFilesContainer.textContent = `Downloaded files:\n${response.fetchedUrls.join(', ')}\nDone!`;
    fieldset.appendChild(downloadedFilesContainer);
  } else {
    console.error('Error:', response.error);
    // Handle error
  }
});

});
