import { noDefiniteAssignment } from "./rules/no-definite-assignment.ts";
import { noMethodBivariance } from "./rules/no-method-bivariance.ts";
import { noMutableArrayWidening } from "./rules/no-mutable-array-widening.ts";
import { noMutablePropertyWidening } from "./rules/no-mutable-property-widening.ts";
import { noOverloadSignature } from "./rules/no-overload-signature.ts";
import { noReturnTypeArgument } from "./rules/no-return-type-argument.ts";
import { noStructuredCloneInstance } from "./rules/no-structured-clone-instance.ts";
import { noTupleMutation } from "./rules/no-tuple-mutation.ts";
import { noTypePredicate } from "./rules/no-type-predicate.ts";

export const plugin = {
  meta: { name: "typerail" },
  rules: {
    "no-mutable-array-widening": noMutableArrayWidening,
    "no-mutable-property-widening": noMutablePropertyWidening,
    "no-method-bivariance": noMethodBivariance,
    "no-tuple-mutation": noTupleMutation,
    "no-definite-assignment": noDefiniteAssignment,
    "no-type-predicate": noTypePredicate,
    "no-overload-signature": noOverloadSignature,
    "no-return-type-argument": noReturnTypeArgument,
    "no-structured-clone-instance": noStructuredCloneInstance,
  },
};
