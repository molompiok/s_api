import vine from '@vinejs/vine'
import { FeaturType } from '#models/feature'
import { isValidArrayJSON, transformJSON } from './Utils/isValidArrayJSON.js'
const Size = 12 * 1024 * 1024
export const CreateFeatureValidator = vine.compile(
  vine.object({
    product_id: vine.string().uuid().trim(),
    name: vine.string().trim().minLength(1).maxLength(56),
    type: vine.enum(Object.values(FeaturType)),
    icon: vine.string()
      .use(isValidArrayJSON())
      .optional()
      .transform(transformJSON),
    default_value: vine.string().maxLength(52).optional(),
    regex: vine.string().maxLength(1024).optional(),
    index: vine.number().min(0).optional(),
    min: vine.number().optional(),
    max: vine.number().optional(),
    min_size: vine.number().min(0).max(Size).optional(),
    max_size: vine.number().min(0).max(Size).optional(),
    multiple: vine.boolean().optional(),
    required: vine.boolean().optional(),
    is_double: vine.boolean().optional(),
  })
)

export const CreateFeatureMessage = {
  'product_id.required': 'Le champ  {{ field }} est obligatoire.',
  'product_id.uuid': 'Le champ  {{ field }} doit être un UUID valide.',
  'name.required': 'Le champ  {{ field }} est obligatoire.',
  'name.minLength': 'Le champ  {{ field }} doit contenir au moins 1 caractère.',
  'name.maxLength': 'Le champ  {{ field }} ne peut pas dépasser 56 caractères.',
  'type.required': 'Le champ  {{ field }} est obligatoire.',
  'type.enum': `Le champ {{ field }} doit être une valeur parmi : ${Object.values(FeaturType).join(', ')}`,
  // Ajoutez d'autres messages personnalisés ici si nécessaire
}

export const UpdateFeatureValidator = vine.compile(
  vine.object({
    feature_id: vine.string().uuid().trim(),
    name: vine.string().trim().minLength(1).maxLength(56),
    type: vine.enum(Object.values(FeaturType)).optional(),
    icon: vine.string()
      .use(isValidArrayJSON())
      .optional()
      .transform(transformJSON),
    default_value: vine.string().maxLength(52).optional(),
    regex: vine.string().maxLength(1024).optional(),
    index: vine.number().min(0).optional(),
    min: vine.number().optional(),
    max: vine.number().optional(),
    min_size: vine.number().min(0).max(Size).optional(),
    max_size: vine.number().min(0).max(Size).optional(),
    multiple: vine.boolean().optional(),
    required: vine.boolean().optional(),
    is_double: vine.boolean().optional(),
  })
)

export const UpdateFeatureMessage = {
  'feature_id.required': 'Le champ  {{ field }} est obligatoire.',
  'product_id.uuid': 'Le champ  {{ field }} doit être un UUID valide.',
  'name.required': 'Le champ  {{ field }} est obligatoire.',
  'name.minLength': 'Le champ  {{ field }} doit contenir au moins 1 caractère.',
  'name.maxLength': 'Le champ  {{ field }} ne peut pas dépasser 56 caractères.',
  'type.required': 'Le champ  {{ field }} est obligatoire.',
  'type.enum': `Le champ type  {{ field }} être une valeur parmi : ${Object.values(FeaturType).join(', ')}`,
  // Ajoutez d'autres messages personnalisés ici si nécessaire
}

export const GetFeaturesValidator = vine.compile(
  vine.object({
    product_id: vine.string().uuid().trim().optional(),
    feature_id: vine.string().uuid().trim().optional(),
  })
);

export const GetFeaturesMessage = {
  'product_id.uuid': 'Le champ {{ field }} doit être un UUID valide.',
  'feature_id.uuid': 'Le champ {{ field }} doit être un UUID valide.',
};
export const GetFeaturesWithValuesValidator = vine.compile(
  vine.object({
    product_id: vine.string().uuid().trim().optional(),
    feature_id: vine.string().uuid().trim().optional(),
  })
);

export const GetFeaturesWithValuesMessage = {
  'product_id.uuid': 'Le champ {{ field }} doit être un UUID valide.',
  'feature_id.uuid': 'Le champ {{ field }} doit être un UUID valide.',
};

export const DeleteFeatureValidator = vine.compile(
  vine.object({
    id: vine.string().uuid().trim(),
  })
);

export const DeleteFeatureMessage = {
  'id.required': 'Le champ {{ field }} est obligatoire.',
  'id.uuid': 'Le champ {{ field }} doit être un UUID valide.',
};

export const UpdateFeaturesValuesValidator = vine.compile(
  vine.object({
    product_id: vine.string().uuid(),
    // Option 1 : Si features doit être une chaîne JSON valide
    features: vine.string().transform(transformJSON),})
);

export const UpdateFeaturesValuesMessage = {
  'product_id.required': 'Le champ {{ field }} est obligatoire.',
  'product_id.uuid': 'Le champ {{ field }} doit être un UUID valide.',
  'features.required': 'Le champ {{ field }} est obligatoire.',
};

export const TestValidator = vine.compile(
  vine.object({
    name: vine.string(),
  })
);

export const TestMessages = {
  'name.required': 'Le champ {{ field }} est obligatoire.',
};