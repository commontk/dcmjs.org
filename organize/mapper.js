// FIXMEs:
// - clone $dicomDOM more easily
// - need a function to create NEW tags in $dicomDOM (see broken implementation in mapDom function)
// - remove private tags unless specified
// - optional selector to remove everything that's not in tagNamesToAlwaysKeep (mapdefaults.js)
//   (these tags are defined, but no logic exists yet)
// - verify hashUID function

// example setup
var mappingTable = [
    ['anonymous', 'hey I mapped you'],
    ['', 'this was empty before']
];

// from mapdefaults.js
var defaultEmpty = tagNamesToEmpty;
var replaceUIDs = instanceUIDs;

var getSpecificReplacer = function(parser) {
    return {
        dicom: {
            'PatientID': function() {
                return "Mr X.";
            },
            'PatientName': function() {
                return parser.getMapTable(parser.getDicom('PatientName'), 0, 1);
            }
        },
        filePath: {
            // TODO
        }
    };
};


// (parser is created once per run)
var getParser = function($oldDicomDom, mapping) {
    return {
        getMapTable: function(matchValue, matchIndex, newIndex) {
            // var mapping = list of lists read from mappingFilePath
            var mapRow = mapping.filter(function(row) {
                return row[matchIndex] === matchValue;
            });
            if (mapRow.length) {
                return mapRow[0][newIndex];
            }
            else {
                throw("No value '" + matchValue +
                    "' found in mapping table column " + matchIndex);
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

var specificReplace = {
    dicom: {
        'PatientName': function() {
            return "Mr X.";
        },
        'PatientID': function() {
            return parsers.mapTable(parsers.dicom('PatientID'), 0, 1);
        }
    },
    filePath: {
        // TODO
    }
};

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

    // allocating the namespace for OID based UUIDs
    var nsUUID = "6ba7b8129dad11d180b400c04fd430c8";

    // convert name to canonical sequence of octets per 14.3:
    var hashUIDBytes = hexStrToBytes(sha1(uid));
    // "hash value" per 14.3 of T-REC-X.667-201210-I
    var hashValue = hashUIDBytes.slice(0, 16);
    // Compute the 16-octet hash value of the name space identifier concatenated with the name
    var preUuidBytes = hashUIDBytes.concat(hashValue);
    var preUuidString = preUuidBytes.map(function(c){return String.fromCharCode(parseInt(c, 10));}).join("");
    // FIXME: verify, this step might not work as expected - maybe some wrong preprocessing in sha1.js?
    var hash = sha1(preUuidString);

    // Set octets 3 through 0 of the "TimeLow" field to octets 3 through 0 of the hash value.
    // Set octets 1 and 0 of the "TimeMid" field to octets 5 and 4 of the hash value.
    // Set octets 1 and 0 of the "VersionAndTimeHigh" field to octets 7 and 6 of the hash value.

    // FIXME: not sure whether above instructions imply some octet shuffling, I'm assuming no for now.

    // - Overwrite the four most significant bits (bits 15 through 12) of the "VersionAndTimeHigh" field with the
    // four-bit version number from Table 3 of 12.2 for the hash function that was used.
    // – Set the "VariantAndClockSeqHigh" field to octet 8 of the hash value.
    // – Overwrite the two most significant bits (bits 7 and 6) of the "VariantAndClockSeqHigh" field with 1 and
    // 0, respectively.
    // – Set the "ClockSeqLow" field to octet 9 of the hash value.
    // – Set octets 5 through 0 of the "Node" field to octets 15 through 10 of the hash value.

    // FIXME: I'm quite sure about "5" in bits 15-12 (four-bit hash version) but not sure about the "9" for bits 7 and 6
    // (just copied that from somewhere)
    var nameUUID = hash.slice(0, 12) + "5" + hash.slice(13, 16) + "9" + hash.slice(17, 33);

    // note implicit type casting
    return "2.25." + hexStrToBytes(nameUUID).join("");
}


var applyReplaceDefaults = function($newDicomDOM, specificReplace, parser) {
    function unlessSpecified(tagList) {
        return tagList.filter(function(tag) {
            return !(tag in specificReplace.dicom);
        });
    }
    unlessSpecified(defaultEmpty).forEach(function(name) {
        tagEmpty($newDicomDOM, name);
    });
    unlessSpecified(replaceUIDs).forEach(function(uidName) {
        // this is counterintuitive but getDicom already hashes UIDs, so
        // just get the value and replace the existing one
        tagReplace($newDicomDOM, uidName, parser.getDicom(uidName));
    });
    // last, a few special cases
    // FIXME:
    tagReplace($newDicomDOM, "PatientIdentityRemoved", "YES");
    tagReplace($newDicomDOM, "DeIdentificationMethod",
        parser.getDicom("DeIdentificationMethod") + "; dcmjs.org");

    // FIXME: remove private groups and any tags
};

// in main func:
// read from old dicom dom and write to new dicomdom
// FIXME: filePath, mapFile
var mapDom = function(xmlString, filePath, mapFile) {
    var $oldDicomDOM = $($.parseXML(xmlString));
    var $newDicomDOM = $($.parseXML(xmlString));
    // TODO: define filePath - should come in arguments
    var parser = getParser($oldDicomDOM, mappingTable, filePath);
    var specificReplace = getSpecificReplacer(parser);
    // deal with dicoms
    Object.keys(specificReplace.dicom).forEach(function(name) {
        tagReplace($newDicomDOM, name, specificReplace.dicom[name]());
    });
    Object.keys(specificReplace.filePath).forEach(function(name) {
        // TODO
    });
    applyReplaceDefaults($newDicomDOM, specificReplace, parser);
    return $newDicomDOM;
};