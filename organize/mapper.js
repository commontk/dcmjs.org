// FIXMEs:
// - if in getSpecificReplacer.dicom: 'TagName': function() {return "mystring"} doesn't ADD the tag if not there.
// - clone $dicomDOM more easily
// - verify hashUID function

// NOTE: not writing into options.status because of performance reasons


// this number describes how many path components (of the PROCESSED file path) are grouped
// in a single zip file. The zip files are labeled according to the grouping.
var zipGroupLevel = 2;

// from mapdefaults.js
var defaultEmpty = tagNamesToEmpty;
var replaceUIDs = instanceUIDs;

var startConfigs = {
    cfDicomSort:
    "// Basic dicom sort:\n" +
    "// This config just sorts images based on dicom header info.\n" +
    "// USE WITH 'noAnonymization' flag!\n" +
    "dicom = {\n" +
    "" +
    "};\n" +
    "filePath = [\n" +
    "    parser.getDicom('PatientName'),\n" +
    "    parser.getDicom('Modality'),\n" +
    "    parser.getDicom('StudyDescription'),\n" +
    "    parser.getDicom('StudyDate'),\n" +
    "    parser.getDicom('SeriesNumber'),\n" +
    "    parser.getDicom('SeriesDescription') + '_' + parser.getDicom('SeriesNumber'),\n" +
    "    parser.getDicom('InstanceNumber') + '.dcm'\n" +
    "];",
    cfFullExample: "dicom = {\n" +
    "// List DICOM Header tags for which you want to change values:\n" +
    "// It's important to assign something to PatientName and PatientID as otherwise\n" +
    "// they will just get emptied by the default behaviour\n" +
    "    'PatientName': function() {\n" +
    "        // set to a static value\n" +
    "        // return 'myID';\n" +
    "        // OR set to header value of same DICOM instance\n" +
    "        // return parser.getDicom('PatientID')\n" +
    "        // OR set to a component of the files directory path\n" +
    "        return parser.getFilePathComp('centersubj');\n" +
    "    },\n" +
    "    // this example replaces the patient name per mapping table column labeled 'CURR_ID' (original)\n" +
    "    // and 'NEW_ID' (target)\n" +
    "    'PatientID': function() {\n" +
    "        return parser.getMapping(parser.getDicom('PatientID'), 'CURR_ID', 'NEW_ID');\n" +
    "    },\n" +
    "    // this example finds the patientname in mapping table column 0 and offsets the CONTENTDATE by days per column 2\n" +
    "    'ContentDate': function() {\n" +
    "        return parser.addDays(parser.getDicom('StudyDate'), parser.getMapping(\n" + 
    "            parser.getDicom('PatientID'), 'CURR_ID', 'DATE_OFFSET'));\n" +
    "    },\n" +
    "};\n" +
    "// filePath lists the components of the new path to be written.\n" +
    "// If taken from old path, component names must be available in filePathPattern,\n" +
    "// and actual file path must be deep enough for getFilePathComp to find its match\n" +
    "filePath = [\n" +
    "    parser.getFilePathComp('trialname'),\n" +
    "    parser.getFilePathComp('centersubj') + '_OR_' + parser.getDicom('PatientID'),\n" +
    "    parser.getDicom('StudyDate'),\n" +
    "    parser.getDicom('SeriesDescription') + '_' + parser.getDicom('SeriesNumber'),\n" +
    "    parser.getDicom('InstanceNumber') + '.dcm'\n" +
    "];"
};



// TODO: extract below specific instructions from UI
var getSpecificReplacer = function(parser, specificMapConfigs) {
    try {
        var f = new Function('parser', 'var dicom, filePath; ' +
                specificMapConfigs +
                '\nreturn {dicom: dicom, filePath: filePath};');
        return f(parser);
    }
    catch(e) {
        throw('invalid mapping instructions in editor:\n' + e.toString());
    }
};


// (parser is created once per run)
// TODO: var mapTable = list of lists read from mappingFilePath
var getParser = function($oldDicomDom, mapTable, filePath, options, status) {
    var csvHeaders = mapTable.header;
    var csvData = mapTable.data;
    return {
        getMapping: function(matchValue, matchHeader, mapHeader) {
            var matchIndex = csvHeaders.indexOf(matchHeader);
            var newIndex = csvHeaders.indexOf(mapHeader);

            var mapRow = csvData.filter(function(row) {
                return row[matchIndex] === matchValue;
            });
            if (mapRow.length) {
                return mapRow[0][newIndex];
            } else {
                status.mapFailed = true;
                // TODO: create a downloadable log
                var issue = ("Warning: No value '" + matchValue +
                      "' found in mapping table column " + matchHeader);
                status.log.push(issue);
                // options.status(issue);
            }
        },
        // compName should be in filePathCompNames
        getFilePathComp: function(compName) {
            // filePathPattern describes the expectations of where file path components are found in case
            // they are needed for populating dicom or for saving
            var filePathCompNames = options.filePathPattern.replace(/^\/|\/$/g, '').split('/');
            var idx = filePathCompNames.indexOf(compName);
            // slice: path starts with / and first split is ""
            var pathComps = filePath.split("/").slice(1);
            if (idx == -1 || idx >= pathComps.length) {
                var issue;
                if (idx == -1) {
                    issue = "Warning: path component name not found in component names list";
                }
                if (idx >= pathComps.length) {
                    issue = "Warning: the specified path component is deeper than the available directory hierarchy";
                }
                status.filePathFailed = true;
                status.log.push(issue);
                // options.status(issue);
                if (options.mapOptions.requireDirectoryMatch) {
                    throw(issue);
                }
                return "invalidpath";
            }
            return pathComps[idx];
        },
        getDicom: function(tagName) {
            var ret = $oldDicomDom.find('[name=' + tagName + ']').text();
            // we do this check so that a specific operation never gets access
            // to the old UIDs but always the new ones
            if (replaceUIDs.indexOf(tagName) > -1) {
                ret = hashUID(ret);
            }
            return ret;
        },

        // function is parked here for the access to status. Will likely change
        addDays: function(dcmDate, numDays) {
            var dcmFormat = "YYYYMMDD";
            // just to make sure
            dcmDate = String(dcmDate);
            var currDate = moment(dcmDate, dcmFormat);
            if (!currDate.isValid()) {
                var issue = "Warning: no valid date found when trying to add days in mapper";
                status.log.push(issue);
                // options.status(issue);
                return "";
            }
            else {
                return currDate.add(numDays, 'days').format(dcmFormat);
            }
        }
    };
};


// make file path components file system safe
var cleanFilePath = function(arr) {
    return arr.map(function(comp) {
        if (typeof comp == 'undefined' || comp == '') {
            comp = 'unavailable';            
        }
        return encodeURIComponent(comp.replace(/[ \/]/g, '_'));
    });
};

// tag manipulation functions
// empty if present
function tagEmpty(jQDom, name) {
    var el = jQDom.find('[name=' + name + ']');
    var hadContent = !!el.text();
    el.text("");
    return hadContent;
}

function tagReplace(jQDom, name, value) {
    // (ensure it's used as a setter with the || "")
    jQDom.find('[name=' + name + ']').text(value || "");
}

// example implementation
function tagAsAnonymized(jQDom, mapOptions) {
    function optionsAsString() {
        // need to keep the full tag under 64 chars!
        var options = [];
        ['keepPrivateTags', 'keepWhitelistedTagsOnly']
            .forEach(function(optName) {
                if (mapOptions[optName]) {
                    options.push(optName);
                }
            });
        return options.length ? ' - ' + options.join(', ') : '';
        // return Object.keys(mapOptions).map(function(key) {
        //     return key + ":" + mapOptions[key];
        // }).join(", ");
    }
    // set Patient Identity Removed to YES
    jQDom.find("data-set").append($(
            "<element " +
                "name='PatientIdentityRemoved'" +
                "tag = '0012,0062'" +
                "vr = 'CS'" +
            ">").append("YES"))
    // set Deidentification method
        .append($(
            "<element " +
                "name='DeIdentificationMethod'" +
                "tag = '0012,0063'" +
                "vr = 'LO'" +
            ">").append("dcmjs.org" + optionsAsString()));
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
    // ideally the byte input). I'm actually pretty sure it's not the right thing, as I've tested it against
    // the example on http://de.wikipedia.org/wiki/Universally_Unique_Identifier.
    // --> The bytes match but the calculated hash is not the same.
    // Maybe because strings with non-UTF-8 chars get modified inside sha1() -> better sha1 available?
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

/*
 * options - currently only passed for adding options to DICOM header after anonymization
 */
var applyReplaceDefaults = function(jQDom, specificReplace, parser, options, status) {
    function unlessSpecified(tagList) {
        return tagList.filter(function(tag) {
            return !(tag in specificReplace.dicom);
        });
    }
    // empty all tags in defaultEmpty, unless there's a specific instruction
    // to do something else
    unlessSpecified(defaultEmpty).forEach(function(name) {
        var hadContent = tagEmpty(jQDom, name);
        if (hadContent) {
            var info = ("Info: Emptying <" + name + ">");
            status.log.push(info);
            // options.status(info);
        }
    });
    // hash all UIDs in replaceUID, unless there's a specific instruction
    // to do something else
    unlessSpecified(replaceUIDs).forEach(function(uidName) {
        // this is counterintuitive but getDicom already hashes UIDs, so
        // we can never use the original value. Just get the value
        // and replace the existing one
        tagReplace(jQDom, uidName, parser.getDicom(uidName));
    });
    // last, a few special cases
    tagAsAnonymized(jQDom, options.mapOptions);
};

var removePrivateTags = function(jQDom) {
    jQDom.find("data-set > element").each(function() {
        var tag = this.getAttribute('tag');
        var tagIsPrivate = (Number("0x"+tag[3]) % 2 === 1);
        if (tagIsPrivate) {
            this.remove();
        }
    });
};

var removeNonWhitelistedTags = function(jQDom, whiteListTags, specialTags, instanceUids) {
    jQDom.find("data-set > element").each(function(idx, elm) {
        var name = elm.getAttribute('name');
        if (whiteListTags.concat(specialTags).concat(instanceUids)
                .indexOf(name) == -1) {
            elm.innerHTML = "";
        }
    });
};

// in main func:
// read from old dicom dom and write to new dicomdom
var mapDom = function(xmlString, filePath, csvMappingTable, specificMapConfigs, options) {
    var status = {log: [], mapFailed: false};
    // TODO: we can probably get rid of this default setting action. options.mapOptions undefined
    // would be a problem anyway
    options = options || {};
    ['noAnonymization', 'requireDirectoryMatch', 'keepWhitelistedTagsOnly', 'keepPrivateTags']
            .forEach(function(optName) {
        if (typeof options.mapOptions[optName] == 'undefined') options.mapOptions[optName] = false;
    });

    // make a DOM to query and a DOM to update
    var $oldDicomDOM = $($.parseXML(xmlString));
    var $newDicomDOM = $($.parseXML(xmlString));

    var parser = getParser($oldDicomDOM, csvMappingTable, filePath, options, status);
    var specificReplace = getSpecificReplacer(parser, specificMapConfigs);

    // deal with specific replace instructions
    // the specific replace instructions are the the place where
    // the mapping table can be used
    Object.keys(specificReplace.dicom).forEach(function(name) {
        tagReplace($newDicomDOM, name, specificReplace.dicom[name]());
    });

    // find new path:
    var cleanedFileComps = cleanFilePath(specificReplace.filePath);
    var newFilePath = "/" + cleanedFileComps.join("/");
    var zipFileID = cleanedFileComps.slice(0, zipGroupLevel).join("__");

    if (!options.mapOptions.noAnonymization) {
        applyReplaceDefaults($newDicomDOM, specificReplace, parser, options, status);

        if (!options.mapOptions.keepPrivateTags) {
            removePrivateTags($newDicomDOM);
        }
    }

    if (options.mapOptions.keepWhitelistedTagsOnly) {
        removeNonWhitelistedTags($newDicomDOM, tagNamesToAlwaysKeep,
            Object.keys(specificReplace.dicom), instanceUIDs);
    }

    return {
        dicom: $newDicomDOM,
        status: status,
        filePath: newFilePath,
        zipFileID: zipFileID
    };
};
