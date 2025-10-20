import { useLoaderData, useSearchParams, Link } from "react-router";
import { useState, useCallback } from "react";
import {
  Page,
  Card,
  DataTable,
  Text,
  Badge,
  BlockStack,
  Button,
  InlineStack,
  Filters,
  ChoiceList,
  DatePicker,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const direction = url.searchParams.get('direction') || 'next';
  const searchQuery = url.searchParams.get('query') || '';
  const status = url.searchParams.get('status') || '';
  const paymentStatus = url.searchParams.get('paymentStatus') || '';
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');

  let queryFilter = '';
  
  if (searchQuery) {
    queryFilter += ` name:${searchQuery}`;
  }
  
  if (dateFrom) {
    queryFilter += ` created_at:>='${dateFrom}'`;
  }
  if (dateTo) {
    queryFilter += ` created_at:<='${dateTo}'`;
  }
  
  const queryParam = queryFilter ? `, query: "${queryFilter.trim()}"` : '';
  const afterParam = direction === 'next' && cursor ? `, after: "${cursor}"` : '';
  const beforeParam = direction === 'prev' && cursor ? `, before: "${cursor}"` : '';
  
  const response = await admin.graphql(
    `#graphql
      query {
        orders(first: 50, reverse: true${afterParam}${beforeParam}${queryParam}) {
          edges {
            cursor
            node {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              shippingLine {
                title
              }
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
                    customAttributes {
                      key
                      value
                    }
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `
  );

  const responseJson = await response.json();

  if (!responseJson.data || !responseJson.data.orders) {
    return { 
      orders: [], 
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      shop: session.shop 
    };
  }

  let orders = responseJson.data.orders.edges.map(edge => edge.node);
  
  if (status) {
    orders = orders.filter(order => order.displayFulfillmentStatus === status);
  }
  
  if (paymentStatus) {
    orders = orders.filter(order => order.displayFinancialStatus === paymentStatus);
  }

  const pageInfo = responseJson.data.orders.pageInfo;

  return { orders, pageInfo, shop: session.shop };
};

function translateFinancialStatus(status) {
  const translations = {
    'PENDING': 'En attente',
    'AUTHORIZED': 'Autorisé',
    'PARTIALLY_PAID': 'Partiellement payé',
    'PAID': 'Payé',
    'PARTIALLY_REFUNDED': 'Partiellement remboursé',
    'REFUNDED': 'Remboursé',
    'VOIDED': 'Annulé',
    'EXPIRED': 'Expiré',
  };
  return translations[status] || status;
}

function translateFulfillmentStatus(status) {
  const translations = {
    'UNFULFILLED': 'Non traitée',
    'PARTIALLY_FULFILLED': 'Partiellement traitée',
    'FULFILLED': 'Traitée',
    'SCHEDULED': 'Planifiée',
    'ON_HOLD': 'En attente',
  };
  return translations[status] || status;
}

function groupProductsByBundle(lineItems) {
  const bundles = {};
  const standaloneProducts = [];

  lineItems.forEach((item) => {
    const bundleProperty = item.customAttributes?.find(
      attr => attr.key === 'bundle_id' || attr.key === '_bundle_id'
    );

    if (bundleProperty) {
      const bundleId = bundleProperty.value;
      
      if (!bundles[bundleId]) {
        const bundleName = item.customAttributes?.find(
          attr => attr.key === 'bundle_name' || attr.key === '_bundle_name'
        );
        
        bundles[bundleId] = {
          id: bundleId,
          name: bundleName?.value || `Bundle ${bundleId}`,
          products: [],
          totalPrice: 0,
        };
      }

      const price = parseFloat(item.originalUnitPriceSet.shopMoney.amount);
      
      bundles[bundleId].products.push({
        title: item.title,
        quantity: item.quantity,
        price: price,
      });

      bundles[bundleId].totalPrice += price * item.quantity;
    } else {
      const price = parseFloat(item.originalUnitPriceSet.shopMoney.amount);
      standaloneProducts.push({
        title: item.title,
        quantity: item.quantity,
        price: price,
      });
    }
  });

  return {
    bundles: Object.values(bundles),
    standaloneProducts,
  };
}

function exportOrdersToCSV(orders) {
  const headers = [
    'Numéro de commande',
    'Date',
    'Statut paiement',
    'Statut livraison',
    'Mode de livraison',
    'Nom du bundle',
    'Produits du bundle',
    'Quantité totale',
    'Prix total',
    'Devise'
  ];

  const rows = [];
  
  orders.forEach((order) => {
    const orderDate = new Date(order.createdAt).toLocaleDateString('fr-FR');
    const lineItems = order.lineItems.edges.map(e => e.node);
    const grouped = groupProductsByBundle(lineItems);
    
    const paymentStatus = translateFinancialStatus(order.displayFinancialStatus);
    const fulfillmentStatus = translateFulfillmentStatus(order.displayFulfillmentStatus);
    const shippingMethod = order.shippingLine?.title || 'Non spécifié';
    
    if (grouped.bundles && grouped.bundles.length > 0) {
      grouped.bundles.forEach((bundle) => {
        const productsText = bundle.products
          .map(p => `${p.title} (x${p.quantity})`)
          .join(', ');
        
        const totalQty = bundle.products.reduce((sum, p) => sum + p.quantity, 0);
        
        rows.push([
          order.name,
          orderDate,
          paymentStatus,
          fulfillmentStatus,
          shippingMethod,
          bundle.name,
          productsText,
          totalQty,
          bundle.totalPrice.toFixed(2),
          order.totalPriceSet.shopMoney.currencyCode
        ]);
      });
    }
    
    if (grouped.standaloneProducts && grouped.standaloneProducts.length > 0) {
      grouped.standaloneProducts.forEach((product) => {
        rows.push([
          order.name,
          orderDate,
          paymentStatus,
          fulfillmentStatus,
          shippingMethod,
          'Produit seul',
          `${product.title} (x${product.quantity})`,
          product.quantity,
          product.price.toFixed(2),
          order.totalPriceSet.shopMoney.currencyCode
        ]);
      });
    }
  });

  let csvContent = '\uFEFF' + headers.join(';') + '\n';
  
  rows.forEach((row) => {
    const escapedRow = row.map(cell => {
      const cellStr = String(cell);
      if (cellStr.includes(';') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    });
    csvContent += escapedRow.join(';') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `commandes_bundles_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function OrdersIndex() {
  const { orders, pageInfo, shop } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [queryValue, setQueryValue] = useState(searchParams.get('query') || '');
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get('status') ? [searchParams.get('status')] : []
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(
    searchParams.get('paymentStatus') ? [searchParams.get('paymentStatus')] : []
  );
  
  const [selectedDates, setSelectedDates] = useState({
    start: searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')) : new Date(),
    end: searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')) : new Date(),
  });
  const [dateFilterApplied, setDateFilterApplied] = useState(
    !!(searchParams.get('dateFrom') || searchParams.get('dateTo'))
  );

  const handleQueryChange = useCallback((value) => {
    setQueryValue(value);
  }, []);

  const handleQueryClear = useCallback(() => {
    setQueryValue('');
    const params = new URLSearchParams(searchParams);
    params.delete('query');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (queryValue) {
      params.set('query', queryValue);
    } else {
      params.delete('query');
    }
    params.delete('cursor');
    setSearchParams(params);
  }, [queryValue, searchParams, setSearchParams]);

  const handleStatusChange = useCallback((value) => {
    setStatusFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value.length > 0) {
      params.set('status', value[0]);
    } else {
      params.delete('status');
    }
    params.delete('cursor');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);
  
  const handlePaymentStatusChange = useCallback((value) => {
    setPaymentStatusFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value.length > 0) {
      params.set('paymentStatus', value[0]);
    } else {
      params.delete('paymentStatus');
    }
    params.delete('cursor');
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleFiltersClearAll = useCallback(() => {
    setQueryValue('');
    setStatusFilter([]);
    setPaymentStatusFilter([]);
    setDateFilterApplied(false);
    setSearchParams({});
  }, [setSearchParams]);

  const handleExport = useCallback(() => {
    exportOrdersToCSV(orders);
  }, [orders]);
  
  const handleDateChange = useCallback((value) => {
    setSelectedDates(value);
  }, []);
  
  const handleApplyDateFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedDates.start) {
      params.set('dateFrom', selectedDates.start.toISOString().split('T')[0]);
    }
    if (selectedDates.end) {
      params.set('dateTo', selectedDates.end.toISOString().split('T')[0]);
    }
    params.delete('cursor');
    setSearchParams(params);
    setDateFilterApplied(true);
  }, [selectedDates, searchParams, setSearchParams]);
  
  const handleRemoveDateFilter = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('dateFrom');
    params.delete('dateTo');
    params.delete('cursor');
    setSearchParams(params);
    setDateFilterApplied(false);
  }, [searchParams, setSearchParams]);

  if (!orders || orders.length === 0) {
    return (
      <Page title="Commandes avec Bundles" fullWidth>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Aucune commande trouvée</Text>
            <Text as="p">
              {searchParams.get('query') || searchParams.get('status') || searchParams.get('paymentStatus') || searchParams.get('dateFrom')
                ? "Aucune commande ne correspond à votre recherche."
                : "Votre store n'a pas encore de commandes."}
            </Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const rows = orders.map((order) => {
    const orderId = order.id.split('/').pop();
    const itemCount = order.lineItems.edges.length;
    const shopifyAdminUrl = `https://${shop}/admin/orders/${orderId}`;
    const shippingMethod = order.shippingLine?.title || 'Non spécifié';
    
    return [
      <InlineStack gap="200" blockAlign="center">
          <Link 
            to={`/app/orders/${orderId}`} 
            style={{ color: '#2c6ecb', textDecoration: 'none', fontWeight: '500' }}
          >
           voir produit regroupé {order.name}
          </Link>
        <a 
          href={shopifyAdminUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ color: '#6b7280', fontSize: '12px', textDecoration: 'none' }}
        >
          Voir dans Shopify →
        </a>
      </InlineStack>,
      new Date(order.createdAt).toLocaleDateString('fr-FR'),
      'Client',
      <Badge tone={order.displayFinancialStatus === 'PAID' ? 'success' : order.displayFinancialStatus === 'PENDING' ? 'info' : 'attention'}>
        {translateFinancialStatus(order.displayFinancialStatus)}
      </Badge>,
      <Badge tone={order.displayFulfillmentStatus === 'FULFILLED' ? 'success' : 'attention'}>
        {translateFulfillmentStatus(order.displayFulfillmentStatus)}
      </Badge>,
      shippingMethod,
      `${itemCount} produit${itemCount > 1 ? 's' : ''}`,
      `${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}`,
    ];
  });

  const handleNextPage = () => {
    const params = new URLSearchParams(searchParams);
    params.set('cursor', pageInfo.endCursor);
    params.set('direction', 'next');
    setSearchParams(params);
  };

  const handlePreviousPage = () => {
    const params = new URLSearchParams(searchParams);
    params.set('cursor', pageInfo.startCursor);
    params.set('direction', 'prev');
    setSearchParams(params);
  };

  const filters = [
    {
      key: 'status',
      label: 'Statut de livraison',
      filter: (
        <ChoiceList
          title="Statut"
          titleHidden
          choices={[
            { label: 'Non traitée', value: 'UNFULFILLED' },
            { label: 'Partiellement traitée', value: 'PARTIALLY_FULFILLED' },
            { label: 'Traitée', value: 'FULFILLED' },
          ]}
          selected={statusFilter}
          onChange={handleStatusChange}
        />
      ),
      shortcut: true,
    },
    {
      key: 'paymentStatus',
      label: 'Statut de paiement',
      filter: (
        <ChoiceList
          title="Statut de paiement"
          titleHidden
          choices={[
            { label: 'En attente', value: 'PENDING' },
            { label: 'Autorisé', value: 'AUTHORIZED' },
            { label: 'Payé', value: 'PAID' },
            { label: 'Partiellement payé', value: 'PARTIALLY_PAID' },
            { label: 'Remboursé', value: 'REFUNDED' },
            { label: 'Partiellement remboursé', value: 'PARTIALLY_REFUNDED' },
            { label: 'Annulé', value: 'VOIDED' },
          ]}
          selected={paymentStatusFilter}
          onChange={handlePaymentStatusChange}
        />
      ),
      shortcut: true,
    },
    {
      key: 'date',
      label: 'Date de commande',
      filter: (
        <div style={{ padding: '16px' }}>
          <BlockStack gap="200">
            <DatePicker
              month={selectedDates.start.getMonth()}
              year={selectedDates.start.getFullYear()}
              onChange={handleDateChange}
              selected={selectedDates}
              allowRange
            />
            <Button onClick={handleApplyDateFilter} variant="primary" fullWidth>
              Appliquer
            </Button>
          </BlockStack>
        </div>
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = [];
  if (statusFilter.length > 0) {
    const statusLabels = {
      'UNFULFILLED': 'Non traitée',
      'PARTIALLY_FULFILLED': 'Partiellement traitée',
      'FULFILLED': 'Traitée'
    };
    appliedFilters.push({
      key: 'status',
      label: `Statut livraison: ${statusLabels[statusFilter[0]]}`,
      onRemove: () => handleStatusChange([]),
    });
  }
  if (paymentStatusFilter.length > 0) {
    const paymentStatusLabels = {
      'PENDING': 'En attente',
      'AUTHORIZED': 'Autorisé',
      'PAID': 'Payé',
      'PARTIALLY_PAID': 'Partiellement payé',
      'REFUNDED': 'Remboursé',
      'PARTIALLY_REFUNDED': 'Partiellement remboursé',
      'VOIDED': 'Annulé',
    };
    appliedFilters.push({
      key: 'paymentStatus',
      label: `Statut paiement: ${paymentStatusLabels[paymentStatusFilter[0]]}`,
      onRemove: () => handlePaymentStatusChange([]),
    });
  }
  if (dateFilterApplied) {
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    let dateLabel = 'Date: ';
    if (dateFrom && dateTo) {
      dateLabel += `${new Date(dateFrom).toLocaleDateString('fr-FR')} - ${new Date(dateTo).toLocaleDateString('fr-FR')}`;
    } else if (dateFrom) {
      dateLabel += `À partir du ${new Date(dateFrom).toLocaleDateString('fr-FR')}`;
    } else if (dateTo) {
      dateLabel += `Jusqu'au ${new Date(dateTo).toLocaleDateString('fr-FR')}`;
    }
    appliedFilters.push({
      key: 'date',
      label: dateLabel,
      onRemove: handleRemoveDateFilter,
    });
  }

  return (
    <Page 
      title="Commandes avec Bundles"
      primaryAction={{
        content: 'Exporter en CSV',
        onAction: handleExport,
      }}
      fullWidth
    >
      <BlockStack gap="400">
        <Card padding="0">
          <div style={{ padding: '16px' }}>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Rechercher par numéro de commande..."
                    value={queryValue}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <Button onClick={handleSearch} variant="primary">
                  Rechercher
                </Button>
                {queryValue && (
                  <Button onClick={handleQueryClear}>
                    Effacer
                  </Button>
                )}
              </InlineStack>
              <Filters
                filters={filters}
                appliedFilters={appliedFilters}
                onClearAll={handleFiltersClearAll}
                hideQueryField
              />
            </BlockStack>
          </div>
        </Card>

        <Card>
          <Text as="p" variant="bodySm" tone="subdued">
            {orders.length} commande{orders.length > 1 ? 's' : ''} • Page de 50 résultats
          </Text>
        </Card>
        
        <Card padding="0">
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
            headings={['Commande', 'Date', 'Client', 'Statut paiement', 'Statut livraison', 'Mode de livraison', 'Produits', 'Total']}
            rows={rows}
          />
        </Card>

        <Card>
          <InlineStack align="space-between">
            <Button 
              disabled={!pageInfo.hasPreviousPage}
              onClick={handlePreviousPage}
            >
              ← Précédent
            </Button>
            <Button 
              disabled={!pageInfo.hasNextPage}
              onClick={handleNextPage}
            >
              Suivant →
            </Button>
          </InlineStack>
        </Card>
      </BlockStack>
    </Page>
  );
}