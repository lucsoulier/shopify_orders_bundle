import { useLoaderData } from "react-router";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Divider,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// Fonction pour grouper les produits par bundle en utilisant lineItemGroup
function groupProductsByBundle(lineItems) {
  const bundleGroups = {};
  const standaloneProducts = [];

  lineItems.forEach((item) => {
    if (item.lineItemGroup) {
      // Ce produit fait partie d'un bundle
      const groupId = item.lineItemGroup.id;

      if (!bundleGroups[groupId]) {
        bundleGroups[groupId] = {
          id: groupId,
          name: item.lineItemGroup.title,
          quantity: item.lineItemGroup.quantity,
          products: [],
          totalPrice: 0,
        };
      }

      const price = parseFloat(item.originalUnitPriceSet.shopMoney.amount);
      bundleGroups[groupId].products.push({
        title: item.title,
        quantity: item.quantity,
        price: price,
      });
      bundleGroups[groupId].totalPrice += price * item.quantity;
    } else {
      // Produit standalone
      const price = parseFloat(item.originalUnitPriceSet.shopMoney.amount);
      standaloneProducts.push({
        title: item.title,
        quantity: item.quantity,
        price: price,
        totalPrice: price * item.quantity,
      });
    }
  });

  return {
    bundles: Object.values(bundleGroups),
    standaloneProducts,
  };
}

export const loader = async ({ params, request }) => {
  const { admin } = await authenticate.admin(request);
  const orderId = `gid://shopify/Order/${params.id}`;

  const response = await admin.graphql(
    `#graphql
      query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItemGroup {
                  id
                  title
                  quantity
                  productId
                  variantId
                }
              }
            }
          }
        }
      }
    `,
    { variables: { id: orderId } }
  );

  const responseJson = await response.json();
  const order = responseJson.data.order;
  const lineItems = order.lineItems.edges.map(edge => edge.node);

  const grouped = groupProductsByBundle(lineItems);

  return { order, ...grouped };
};

export default function OrderDetail() {
  const { order, bundles, standaloneProducts } = useLoaderData();

  // Combiner bundles et produits standalone pour l'affichage
  const allProducts = [];

  // Ajouter les bundles
  bundles.forEach((bundle) => {
    allProducts.push({
      type: 'bundle',
      data: bundle,
    });
  });

  // Ajouter les produits standalone
  standaloneProducts.forEach((product) => {
    allProducts.push({
      type: 'product',
      data: product,
    });
  });

  return (
    <Page
      title={`Commande ${order.name}`}
      backAction={{ content: 'Commandes', url: '/app/orders' }}
      fullWidth
    >
      <BlockStack gap="400">
        {/* Informations de la commande */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Informations</Text>
              <Badge tone={order.displayFulfillmentStatus === 'FULFILLED' ? 'success' : 'attention'}>
                {order.displayFulfillmentStatus}
              </Badge>
            </InlineStack>
            <BlockStack gap="200">
              <Text as="p">
                <strong>Date :</strong> {new Date(order.createdAt).toLocaleDateString('fr-FR')}
              </Text>
              <Text as="p">
                <strong>Total :</strong> {order.totalPriceSet.shopMoney.amount} {order.totalPriceSet.shopMoney.currencyCode}
              </Text>
              <Text as="p">
                <strong>Statut paiement :</strong> {order.displayFinancialStatus}
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Produits (bundles et produits individuels) */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              Produits ({bundles.length + standaloneProducts.length})
            </Text>
            <Divider />
            <BlockStack gap="300">
              {allProducts.map((item, index) => (
                <div key={index}>
                  {item.type === 'bundle' ? (
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <InlineStack gap="200" align="start">
                            <Badge tone="info">Bundle</Badge>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {item.data.name} × {item.data.quantity}
                            </Text>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            ({item.data.products.map(p => p.title).join(', ')})
                          </Text>
                        </BlockStack>
                        <Text as="p" tone="subdued">
                          {item.data.totalPrice.toFixed(2)} EUR
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  ) : (
                    <InlineStack align="space-between">
                      <Text as="p">
                        {item.data.title} × {item.data.quantity}
                      </Text>
                      <Text as="p" tone="subdued">
                        {item.data.totalPrice.toFixed(2)} EUR
                      </Text>
                    </InlineStack>
                  )}
                  {index < allProducts.length - 1 && <Divider />}
                </div>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>


      </BlockStack>
    </Page>
  );
}