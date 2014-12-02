// FIXMEs:
// - clone $dicomDOM more easily
// - need a function to create NEW tags in $dicomDOM (see broken implementation in mapDom function)
// - remove private tags unless specified
// - optional selector to remove everything that's not in tagNamesToAlwaysKeep (mapdefaults.js)
//   (these tags are defined, but no logic exists yet)
// - verify hashUID function
// - pass filepaths
// - pass a mapfile


// example setup
var mappingTable = [
    ['anonymous', 'mappedname', 1],
    ['', 'wasempty', 5]
];

// from mapdefaults.js
var defaultEmpty = tagNamesToEmpty;
var replaceUIDs = instanceUIDs;

// TODO: extract specific instructions from UI
var getSpecificReplacer = function(parser) {
    return {
        dicom: {
            // just set a date
            'PatientID': function() {
                return "newID";
            },
            // this example replaces the patient name per mapping table columns 0 (original) and 1 (target)
            'PatientName': function() {
                return parser.getMapped(parser.getDicom('PatientName'), 0, 1);
            },
            // this example finds the patientname in mapping table column 0 and offsets the date by days per column 2
            'StudyDate': function() {
                return addDays(parser.getDicom('StudyDate'), parser.getMapped(parser.getDicom('PatientName'), 0, 2));
            }
        },
        filePath: {
            // TODO
        }
    };
};


// (parser is created once per run)
// TODO: var mapTable = list of lists read from mappingFilePath
var getParser = function($oldDicomDom, mapTable, filePath, options, status) {
    return {
        getMapped: function(matchValue, matchIndex, newIndex) {
            var mapRow = mapTable.filter(function(row) {
                return row[matchIndex] === matchValue;
            });
            if (mapRow.length) {
                return mapRow[0][newIndex];
            } else {
                status.mapFailed = true;
                // TODO: create a downloadable log
                var issue = ("No value '" + matchValue +
                      "' found in mapping table column " + matchIndex);
                status.log.push(issue);
                options.status(issue);
                if (options.requireMapping) {
                  throw(issue);
                }
            }
        },
        getFilePath: function(filePath) {
            return filePath.split(/[\/]+/);
        },
        getDicom: function(tagName) {
            var ret = $oldDicomDom.find('[name=' + tagName + ']').text();
            // we do this check so that a specific operation never gets access
            // to the old UIDs but always the new ones
            if (replaceUIDs.indexOf(tagName) > -1) {
                ret = hashUID(ret);
            }
            return ret;
        }
    };
};


function addDays(dcmDate, numDays) {
    // just to make sure
    dcmDate = String(dcmDate);
    // month is 0 based!
    var origDate = new Date(dcmDate.substring(0,4), dcmDate.substring(4, 6) - 1, dcmDate.substring(6, 8));
    var newDate = new Date(origDate);
    newDate.setDate(newDate.getDate() + numDays);
    return newDate.getFullYear() + ('0' + String(parseInt(newDate.getMonth(), 10) + 1)).slice(-2) + ('0' + newDate.getDate()).slice(-2);
}


// tag manipulation functions
// empty if present
function tagEmpty(jQDom, name) {
    jQDom.find('[name=' + name + ']').text("");
}

function tagReplace(jQDom, name, value) {
    // (ensure it's used as a setter with the || "")
    jQDom.find('[name=' + name + ']').text(value || "");
}

function hashUID(uid) {

    /*
     * comment references:
     * [1]: http://www.itu.int/rec/T-REC-X.667-201210-I/en
     */

    // FIXME: UUID calculation may not be working correctly.
    function hexStrToBytes(str) {
        var result = [];
        while (str.length >= 2) { 
            result.push(parseInt(str.substring(0, 2), 16));
            str = str.substring(2, str.length);
        }

        return result;
    }
    function byteToHexStr(b) {
        return ((b >> 4) & 0x0f).toString(16) + (b & 0x0f).toString(16);
    }

    // verify whether the dicom UID byte representation is a byte representation of strings,
    // or does the uid need to be converted before? (question is referenced below)
    function dicomUidToBytes(uid) {
        var bytes = [];
        for (var i = 0; i < uid.length; ++i) {
            bytes.push(uid.charCodeAt(i));
        }
        return bytes;
    }

    // we're following [1], 14, sub-case 14.3 (SHA1 based)
    // 14.1 bullet 1
    // allocating the namespace for OID based UUIDs
    // from: [1], D.9 "Name string is an OID"
    var nsUUID = "6ba7b8129dad11d180b400c04fd430c8";

    // 14.1 bullet 2, convert name to canonical seq of octets (idea tb verified)
    var nsUUIDBytes = hexStrToBytes(nsUUID);

    // 14.1, bullet 3, compute 16-octet hash value of name space identifier concatenated with name,
    // using SHA-1. (The sentence with "the numbering is..." is tb verified - byte sequence ok?).
    // This hash value is calculated per 14.3. Just quick verification of byte sequence required
    // Question: the DICOM UID is a string - does it need any conversion before hashing? Here I assume not.
    var uidBytes = dicomUidToBytes(uid);
    // Compute the final 16-octet hash value of the name space identifier concatenated with the name
    // First concatenate
    var concatBytes = nsUUIDBytes.concat(uidBytes);
    // in order to hash the bytes, here I'm converting them to a string first.
    var concatAsString = concatBytes.map(function(c){return String.fromCharCode(parseInt(c, 10));}).join("");
    // Then I apply the sha1 on the string.
    // Question: does sha1() do the right thing? Can we compare to any other sha1 given same input? (
    // ideally the byte input)
    var hashValue = sha1(concatAsString);
    // 14.1, bullets 4-6:
    // Set octets 3 through 0 of the "TimeLow" field to octets 3 through 0 of the hash value.
    // Set octets 1 and 0 of the "TimeMid" field to octets 5 and 4 of the hash value.
    // Set octets 1 and 0 of the "VersionAndTimeHigh" field to octets 7 and 6 of the hash value.
    // Question: is there any rearrangement taking place or is the outcome just identical to the
    // byte representation of hashValue? (if yes, I won't need the hashBytes variable for now and stick to the hex hashValue)
    var hashBytes = hexStrToBytes(hashValue);
    // 14.1, bullet 7: overwrite the four most sig bits... with the 4-bit version number from Table3 of 12.2..
    // -> in our case that's "0101" or 5
    // bullet 8: more placing of octets in sequence (?)
    // bullet 9: overwrite 2 most sig bits of VariantAndClockSeqHigh with 1 and 0
    // --> Question: I'm not sure on bullet 9, may have to do a bit level operation there, not sure hex rep
    // does it.
    // I did something pro forma (adding the string "9") but also placing needs to be reviewed
    // (and remaining bullets in 14.1: add rest of bytes in sequence, to be verified)
    // Btw: I truncate the hash to 16 octets = 32 hex values happens here.
    var nameUUID = hashValue.slice(0, 12) + "5" + hashValue.slice(13, 16) + "9" + hashValue.slice(17, 32);

    // finally, casting to a UID again. Need to convert nameUUID to an integer.
    // I'm doing this quick and dirty here, but the String casting may need some left padding
    // overall, this conversion needs a quick check
    return "2.25." + hexStrToBytes(nameUUID).join("");
}


var applyReplaceDefaults = function($newDicomDOM, specificReplace, parser) {
    function unlessSpecified(tagList) {
        return tagList.filter(function(tag) {
            return !(tag in specificReplace.dicom);
        });
    }
    // empty all tags in defaultEmpty, unless there's a specific instruction
    // to do something else
    unlessSpecified(defaultEmpty).forEach(function(name) {
        tagEmpty($newDicomDOM, name);
    });
    // hash all UIDs in replaceUID, unless there's a specific instruction
    // to do something else
    unlessSpecified(replaceUIDs).forEach(function(uidName) {
        // this is counterintuitive but getDicom already hashes UIDs, so
        // we can never use the original value. Just get the value
        // and replace the existing one
        tagReplace($newDicomDOM, uidName, parser.getDicom(uidName));
    });
    // last, a few special cases
    // FIXME:
    tagReplace($newDicomDOM, "PatientIdentityRemoved", "YES");
    tagReplace($newDicomDOM, "DeIdentificationMethod",
        parser.getDicom("DeIdentificationMethod") + "; dcmjs.org");

    // TODO: remove private groups and any tags here - this is currently done
    // in index.html on parsing DICOMs (private tags are just ignored there)
};

// in main func:
// read from old dicom dom and write to new dicomdom
// FIXME: filePath, mapFile
var mapDom = function(xmlString, filePath, mapFile, options) {
    var status = {log: [], mapFailed: false};
    options = options || {};
    if (!options.requireMapping) options.requireMapping = false;

    // make a DOM to query and a DOM to update
    var $oldDicomDOM = $($.parseXML(xmlString));
    var $newDicomDOM = $($.parseXML(xmlString));

    // TODO: define filePath - should come in arguments
    var parser = getParser($oldDicomDOM, mappingTable, filePath, options, status);
    var specificReplace = getSpecificReplacer(parser);

    // deal with specific replace instructions
    // the specific replace instructions are the the place where
    // the mapping table can be used
    Object.keys(specificReplace.dicom).forEach(function(name) {
        tagReplace($newDicomDOM, name, specificReplace.dicom[name]());
    });

    Object.keys(specificReplace.filePath).forEach(function(name) {
        // TODO
    });

    applyReplaceDefaults($newDicomDOM, specificReplace, parser);

    return {
        dicom: $newDicomDOM,
        status: status,
        filePath: "TODO",
        zipFileName: "TODOzipFileName"
    };
};
