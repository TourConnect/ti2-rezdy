const R = require('ramda');

const BOOKING_FIELD_VALUE_ALIASES = {
  'first name': ['firstName', 'name', 'first_name'],
  'last name': ['lastName', 'surname', 'last_name'],
  mobile: ['mobile', 'phone', 'phoneNumber', 'phone_number'],
  email: ['email', 'emailAddress', 'email_address'],
  'special requirements': ['specialRequirements', 'requirements', 'special_requirements'],
  'certification level': ['certificationLevel', 'certLevel', 'certification_level'],
  'certification number': ['certificationNumber', 'certNumber', 'certification_number'],
  'certification agency': ['certificationAgency', 'certAgency', 'certification_agency'],
  postcode: ['postCode', 'postalCode', 'zip', 'zipCode', 'postal_code', 'zip_code'],
  'post code': ['postCode', 'postalCode', 'zip', 'zipCode', 'postal_code', 'zip_code'],
  'postal code': ['postCode', 'postalCode', 'zip', 'zipCode', 'postal_code', 'zip_code'],
  'zip code': ['postCode', 'postalCode', 'zip', 'zipCode', 'postal_code', 'zip_code'],
  zip: ['postCode', 'postalCode', 'zip', 'zipCode'],
};

const CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL = {
  'first name': 'firstName',
  'last name': 'lastName',
  email: 'emailAddress',
  mobile: 'phoneNumber',
  phone: 'phoneNumber',
  country: 'country',
  postcode: 'postCode',
  'post code': 'postCode',
  'postal code': 'postCode',
  'zip code': 'postCode',
  zip: 'postCode',
};

const COUNTRY_FIELD_IDS = new Set(['country', 'nationality']);


  // Apply the live (or fallback) Rezdy country list as the option set on the
// `country` / `nationality` UI fields. NOTE: this is an authoritative override
// — any pre-existing `options` / `type` on those fields (e.g. carried over
// from a Rezdy bookingQuestion) are intentionally replaced so the dropdown
// always renders Rezdy's canonical country list.
const decorateCountryFields = (fieldList, options) => {
  if (!Array.isArray(fieldList)) return fieldList;
  if (!Array.isArray(options) || options.length === 0) return fieldList;
  return fieldList.map(field => {
    const normalizedFieldId = String(field?.id || '').toLowerCase();
    if (!field || !COUNTRY_FIELD_IDS.has(normalizedFieldId)) return field;
    return {
      ...field,
      type: 'extended-option',
      selectMultiple: false,
      options,
    };
  });
};

const GENDER_FIELD_IDS = new Set(['gender', 'sex']);
const DEFAULT_GENDER_OPTIONS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
];

const normalizeGenderOptionValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male' || normalized === 'm') return 'MALE';
  if (normalized === 'female' || normalized === 'f') return 'FEMALE';
  return null;
};

const decorateGenderField = field => {
  const normalizedFieldId = String(field?.id || '').trim().toLowerCase();
  if (!GENDER_FIELD_IDS.has(normalizedFieldId)) return field;
  const normalizedOptions = (Array.isArray(field?.options) ? field.options : [])
    .map((option) => {
      const normalizedValue = normalizeGenderOptionValue(option?.value ?? option?.label ?? option);
      if (!normalizedValue) return null;
      return {
        label: normalizedValue === 'MALE' ? 'Male' : 'Female',
        value: normalizedValue,
      };
    })
    .filter(Boolean);
  const mergedOptions = normalizedOptions.length > 0
    ? Array.from(new Map(normalizedOptions.map(option => [option.value, option])).values())
    : DEFAULT_GENDER_OPTIONS;
  return {
    ...field,
    type: 'extended-option',
    selectMultiple: false,
    options: mergedOptions,
  };
};

const normalizeBookingFieldLabel = (label = '') => String(label)
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .replace(/[^a-z0-9 ]/g, '');

const toCamelCase = (label = '') => {
  const words = String(label)
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  return words
    .map((word, index) => (
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    ))
    .join('');
};

const isPresentValue = value => value !== undefined
  && value !== null
  && !(typeof value === 'string' && value.trim() === '');

const normalizeFieldValueForSubmit = (value) => {
  if (!isPresentValue(value)) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map(normalizeFieldValueForSubmit)
      .filter(item => item !== '')
      .join(',');
  }
  if (typeof value === 'object') {
    const candidate = [
      value.value,
      value.id,
      value.code,
      value.isoCode,
      value.iso_code,
      value.label,
      value.title,
      value.name,
    ].find(isPresentValue);
    if (isPresentValue(candidate)) return normalizeFieldValueForSubmit(candidate);
    try {
      return JSON.stringify(value);
    } catch (_) {
      return '';
    }
  }
  return String(value);
};

const getFieldValueFromArray = ({ source, normalizedLabel, idKeyCandidates = [] }) => {
  if (!source || !Array.isArray(source.fields)) return undefined;
  const idSet = new Set((idKeyCandidates || []).map(String));
  const match = source.fields.find((field) => {
    const lbl = R.path(['label'], field);
    if (lbl && normalizeBookingFieldLabel(lbl) === normalizedLabel) {
      return true;
    }
    const fid = R.path(['id'], field);
    if (fid === undefined || fid === null || fid === '') {
      return false;
    }
    const fidStr = String(fid);
    return idSet.has(fidStr) || idSet.has(fidStr.toLowerCase());
  });
  return match ? match.value : undefined;
};

const resolveBookingFieldValue = ({ label, sources }) => {
  const normalizedLabel = normalizeBookingFieldLabel(label);
  const aliases = BOOKING_FIELD_VALUE_ALIASES[normalizedLabel] || [];
  const candidateKeys = Array.from(new Set([
    ...aliases,
    toCamelCase(label),
    String(label),
    normalizedLabel.replace(/\s+/g, ''),
    normalizedLabel.replace(/\s+/g, '_'),
  ])).filter(Boolean);

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;

    const valueFromFields = getFieldValueFromArray({
      source,
      normalizedLabel,
      idKeyCandidates: candidateKeys,
    });
    if (isPresentValue(valueFromFields)) {
      return valueFromFields;
    }

    for (const key of candidateKeys) {
      if (Object.prototype.hasOwnProperty.call(source, key) && isPresentValue(source[key])) {
        return source[key];
      }
      const customFieldsValue = R.path(['customFields', key], source);
      if (isPresentValue(customFieldsValue)) {
        return customFieldsValue;
      }
    }
  }
  return undefined;
};

const buildBookingFields = ({
  fieldDefinitions,
  sources,
  visibleKey,
  requiredKey,
}) => {
  if (!Array.isArray(fieldDefinitions)) return [];
  const usedLabels = new Set();
  return fieldDefinitions.reduce((acc, fieldDef) => {
    const label = R.path(['label'], fieldDef);
    if (!label || usedLabels.has(normalizeBookingFieldLabel(label))) {
      return acc;
    }
    const isVisible = Boolean(R.path([visibleKey], fieldDef));
    const isRequired = Boolean(R.path([requiredKey], fieldDef));
    // Some suppliers mark fields as required for a scope without setting the
    // matching visibility flag; required must still be asked and sent.
    if (!isVisible && !isRequired) {
      return acc;
    }
    const resolvedValue = resolveBookingFieldValue({
      label,
      sources,
    });
    if (!isPresentValue(resolvedValue) && !isRequired) {
      return acc;
    }
    usedLabels.add(normalizeBookingFieldLabel(label));
    return acc.concat({
      label,
      value: normalizeFieldValueForSubmit(resolvedValue),
    });
  }, []);
};

const mapRezdyFieldTypeToUiType = (fieldType) => {
  const normalized = String(fieldType || '').toLowerCase();
  if (normalized === 'list') return 'extended-option';
  if (normalized === 'textarea' || normalized === 'longtext') return 'long';
  if (normalized === 'boolean') return 'yes-no';
  return 'short';
};

const parseRezdyListOptions = (listOptions) => {
  if (!listOptions || typeof listOptions !== 'string') return undefined;
  const options = listOptions
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => ({ value, label: value }));
  return options.length > 0 ? options : undefined;
};

const toCreateBookingFieldModel = (field = {}) => {
  const label = String(R.pathOr('', ['label'], field)).trim();
  if (!label) return null;
  const normalizedLabel = normalizeBookingFieldLabel(label);
  const fieldId = CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL[normalizedLabel]
    || toCamelCase(label)
    || normalizedLabel.replace(/\s+/g, '_');
  const type = mapRezdyFieldTypeToUiType(R.path(['fieldType'], field));
  const parsedOptions = parseRezdyListOptions(R.path(['listOptions'], field));
  const options = type === 'extended-option' ? (parsedOptions || []) : parsedOptions;
  const visiblePerBooking = Boolean(R.path(['visiblePerBooking'], field));
  const visiblePerParticipant = Boolean(R.path(['visiblePerParticipant'], field));
  const isPerUnitItem = visiblePerParticipant && !visiblePerBooking;
  const requiredPerBooking = Boolean(R.path(['requiredPerBooking'], field));
  const requiredPerParticipant = Boolean(R.path(['requiredPerParticipant'], field));
  const required = requiredPerBooking || requiredPerParticipant;

  const baseField = {
    id: fieldId,
    title: label,
    subtitle: '',
    type,
    required,
    requiredPerBooking,
    requiredPerParticipant,
    visiblePerBooking,
    visiblePerParticipant,
    isPerUnitItem,
    ...(type === 'extended-option' ? { options } : (options ? { options } : {})),
  };
  return decorateGenderField(baseField);
};

const EXPLICIT_FIELD_ID_TO_REZDY_LABEL = {
  firstName: 'First Name',
  lastName: 'Last Name',
  emailAddress: 'Email',
  email: 'Email',
  phoneNumber: 'Mobile',
  phone: 'Mobile',
  mobile: 'Mobile',
  country: 'Country',
  postCode: 'Post Code',
  postalCode: 'Post Code',
  zipCode: 'Post Code',
  zip: 'Post Code',
};

const resolveRezdyLabelForExplicitField = (id, fieldDefinitions) => {
  if (id === undefined || id === null) return null;
  const idStr = String(id);
  if (Object.prototype.hasOwnProperty.call(EXPLICIT_FIELD_ID_TO_REZDY_LABEL, idStr)) {
    return EXPLICIT_FIELD_ID_TO_REZDY_LABEL[idStr];
  }
  if (Array.isArray(fieldDefinitions)) {
    for (const def of fieldDefinitions) {
      const label = R.path(['label'], def);
      if (!label) continue;
      const normalized = normalizeBookingFieldLabel(label);
      const fieldId = CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL[normalized]
        || toCamelCase(label)
        || normalized.replace(/\s+/g, '_');
      if (fieldId === idStr) {
        return label;
      }
    }
  }
  return null;
};

const findBookingFieldDefForRow = (row, fieldDefinitions) => {
  if (!row || !Array.isArray(fieldDefinitions)) return null;
  if (row.label) {
    const n = normalizeBookingFieldLabel(row.label);
    const byLabel = fieldDefinitions.find(
      d => d && d.label && normalizeBookingFieldLabel(d.label) === n,
    );
    if (byLabel) return byLabel;
  }
  if (row.id) {
    const idStr = String(row.id);
    return fieldDefinitions.find((d) => {
      const l = R.path(['label'], d);
      if (!l) return false;
      const normalized = normalizeBookingFieldLabel(l);
      const fieldId = CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL[normalized]
        || toCamelCase(l)
        || normalized.replace(/\s+/g, '_');
      return fieldId === idStr;
    }) || null;
  }
  return null;
};

const filterFieldRowsByVisibility = ({
  rows,
  fieldDefinitions,
  visibilityKey,
  requiredKey,
}) => {
  if (!Array.isArray(rows) || !rows.length) return rows;
  return rows.filter((row) => {
    const def = findBookingFieldDefForRow(row, fieldDefinitions);
    if (!def) return true;
    const isVisible = Boolean(R.path([visibilityKey], def));
    const isRequired = Boolean(R.path([requiredKey], def));
    return isVisible || isRequired;
  });
};

const filterFieldRowsForBookingLevelMerge = (rows, fieldDefinitions) => filterFieldRowsByVisibility({
  rows,
  fieldDefinitions,
  visibilityKey: 'visiblePerBooking',
  requiredKey: 'requiredPerBooking',
});

const filterFieldRowsForParticipantLevelMerge = (rows, fieldDefinitions) => filterFieldRowsByVisibility({
  rows,
  fieldDefinitions,
  visibilityKey: 'visiblePerParticipant',
  requiredKey: 'requiredPerParticipant',
});

const mergeFieldsWithExplicitValues = ({
  generatedFields,
  explicitFields,
  fieldDefinitions,
}) => {
  const merged = [];
  const indexByLabel = {};
  const appendField = (field) => {
    if (!field) return;
    const resolvedLabel = field.label
      || resolveRezdyLabelForExplicitField(field.id, fieldDefinitions);
    if (!resolvedLabel) return;
    const normalized = normalizeBookingFieldLabel(resolvedLabel);
    if (!normalized) return;
    const safeField = {
      label: resolvedLabel,
      value: isPresentValue(field.value) ? String(field.value) : '',
    };
    if (indexByLabel[normalized] === undefined) {
      indexByLabel[normalized] = merged.length;
      merged.push(safeField);
      return;
    }
    merged[indexByLabel[normalized]] = safeField;
  };

  (generatedFields || []).forEach(appendField);
  if (Array.isArray(explicitFields)) {
    explicitFields.forEach(appendField);
  }
  return merged;
};

const holderFieldRowsFromCustomFieldValues = (customFieldValues) => {
  if (!Array.isArray(customFieldValues)) return [];
  return customFieldValues.map((entry) => {
    const field = R.path(['field'], entry);
    if (!field) return null;
    const id = R.path(['id'], field);
    const label = R.path(['title'], field) || R.path(['label'], field);
    if ((id == null || id === '') && !label) return null;
    const value = R.path(['value'], entry);
    return {
      ...(id != null && String(id) !== '' ? { id: String(id) } : {}),
      ...(label ? { label: String(label) } : {}),
      value: value !== undefined && value !== null ? String(value) : '',
    };
  }).filter(Boolean);
};

const mergeHolderWithCustomFieldValues = (holder, customFieldValues) => {
  const extraRows = holderFieldRowsFromCustomFieldValues(customFieldValues);
  if (extraRows.length === 0) {
    return holder;
  }
  const baseFields = Array.isArray(holder && holder.fields) ? holder.fields : [];
  const customFields = { ...R.pathOr({}, ['customFields'], holder) };
  extraRows.forEach((row) => {
    if (row.id) {
      customFields[String(row.id)] = row.value;
    }
  });
  return {
    ...holder,
    fields: baseFields.concat(extraRows),
    customFields,
  };
};

module.exports = {
  CORE_CREATE_BOOKING_FIELD_IDS_BY_LABEL,
  decorateCountryFields,
  decorateGenderField,
  resolveBookingFieldValue,
  buildBookingFields,
  toCreateBookingFieldModel,
  filterFieldRowsForBookingLevelMerge,
  filterFieldRowsForParticipantLevelMerge,
  mergeFieldsWithExplicitValues,
  mergeHolderWithCustomFieldValues,
};
