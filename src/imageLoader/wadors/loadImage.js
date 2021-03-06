import metaDataManager from './metaDataManager.js';
import getPixelData from './getPixelData.js';
import createImage from '../createImage.js';

/**
 * Helper method to extract the transfer-syntax from the response of the server.
 * @param {string} contentType The value of the content-type header as returned by the WADO-RS server.
 * @return The transfer-syntax as announced by the server, or Implicit Little Endian by default.
 */
export function getTransferSyntaxForContentType (contentType) {
    let transferSyntax = '1.2.840.10008.1.2'; // Default is Implicit Little Endian.

    if (contentType) {
        // Browse through the content type parameters
        const parameters = contentType.split(';');

        parameters.forEach(parameter => {
            // Look for a transfer-syntax=XXXX pair
            const parameterValues = parameter.split('=');

            if (parameterValues.length !== 2) {
                return;
            }

            if (parameterValues[0].trim() === 'transfer-syntax') {
                transferSyntax = parameterValues[1].trim() || transferSyntax;
            }
        });
    }

    return transferSyntax;
}

function loadImage (imageId, options) {
    const start = new Date().getTime();
    const uri = imageId.substring(7);

    const promise = new Promise((resolve, reject) => {
        // check to make sure we have metadata for this imageId
        const metaData = metaDataManager.get(imageId);

        if (metaData === undefined) {
            const error = new Error(`no metadata for imageId ${imageId}`);

            return reject(error);
        }

        // TODO: load bulk data items that we might need
        let mediaType = 'multipart/related; type="application/octet-stream"'; // 'image/dicom+jp2';
        //根据TransferSyntax决定mediaType
        let tsuid;
        if (metaData['00020010']
            && ("1.2.840.10008.1.2.4.90" === metaData['00020010'].Value[0] || "1.2.840.10008.1.2.4.91" === metaData['00020010'].Value[0])
        ) {
            tsuid = metaData['00020010'].Value[0];
            mediaType = 'multipart/related; type="image/jp2"';
        } else if (
            metaData['00020010'] &&
            (
                "1.2.840.10008.1.2.4.50" === metaData['00020010'].Value[0] ||
                "1.2.840.10008.1.2.4.51" === metaData['00020010'].Value[0] ||
                "1.2.840.10008.1.2.4.70" === metaData['00020010'].Value[0] ||
                "1.2.840.10008.1.2.4.80" === metaData['00020010'].Value[0] ||
                "1.2.840.10008.1.2.4.81" === metaData['00020010'].Value[0]
            )
        ) {
            tsuid = metaData['00020010'].Value[0];
            mediaType = 'multipart/related; type="image/jpeg"';
        }

        // get the pixel data from the server
        getPixelData(uri, imageId, mediaType).then((result) => {
            const transferSyntax = tsuid || getTransferSyntaxForContentType(result.contentType);
            const pixelData = result.imageFrame.pixelData;
            const imagePromise = createImage(imageId, pixelData, transferSyntax, options);

            imagePromise.then((image) => {
                // add the loadTimeInMS property
                const end = new Date().getTime();

                image.loadTimeInMS = end - start;
                resolve(image);
            }, reject);
        }, reject);
    });

    return {
        promise,
        cancelFn: undefined
    };
}

export default loadImage;
